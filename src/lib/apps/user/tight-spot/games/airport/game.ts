import { z } from "zod";
import { angle_between, type Vec } from "../../core/geometry";
import { STANDING } from "../../core/keys";
import { collide, collide_shape, obstacles, type Obstacles, type Scene } from "../../core/obstacles";
import { hash } from "../../core/seed";
import {
  corners,
  create_car,
  folds,
  Gear,
  jackknife,
  PUSHBACK,
  shift,
  step,
  trailer_pose,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "../../core/vehicle";
import { AircraftPart, aircraft_parts, grow, is_high, nose_gear, SHAPES } from "./aircraft";
import { build_apron, my_stand, Part, type Apron } from "./apron";
import { build_baggage, build_tow, remote_stand } from "./ramp";
import { BAGGAGE, judge_train, PARALLEL, train_done } from "./train";

export const Job = { PUSHBACK: "pushback", BAGGAGE: "baggage", TOW: "tow", TURNAROUND: "turnaround" } as const;
export type Job = (typeof Job)[keyof typeof Job];
export const job_schema = z.enum([Job.PUSHBACK, Job.BAGGAGE, Job.TOW, Job.TURNAROUND]);

export const JOB_NAMES: Record<Job, string> = {
  pushback: "Pushback",
  baggage: "Baggage run",
  tow: "Tow to gate",
  turnaround: "Turnaround",
};

export const Mode = { RANDOM: "random", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.RANDOM, Mode.LEVELS]);

export const Phase = { BAGS: "bags", PUSH: "push", TOW: "tow" } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
  CRASHED: "crashed",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const SPEC: VehicleSpec = PUSHBACK;
export const STEERING_LIMIT = SPEC.hitches[0].max_angle;
/** The tug towing an aircraft nose first: the same tug and aircraft on an ordinary towbar off its back, 1 m clear of the nose. */
export const TOW: VehicleSpec = {
  ...PUSHBACK,
  max_forward: 2.5,
  hitches: [{ ...PUSHBACK.hitches[0], hitch: 6.6, rest: 0 }],
};

export const STOP_ALONG = 1;
export const ON_LINE = 0.5;
export const MAX_ANGLE = (5 * Math.PI) / 180;

export interface Round {
  job: Job;
  seed: number;
  difficulty: number;
  level?: number;
  daily?: string;
}

export const Ours = { TUG: "tug", TRAIN: "train", ...AircraftPart } as const;
export type Ours = (typeof Ours)[keyof typeof Ours];

export const STEERING = "steering";
export const JACKKNIFE = "jackknife";

export interface Hit {
  kind: Part | typeof STEERING | typeof JACKKNIFE;
  by: Ours;
  hinge?: number;
}

export interface GameState {
  round: Round;
  apron: Apron;
  phase: Phase;
  spec: VehicleSpec;
  scene: Scene;
  car: Car;
  status: Status;
  /** Changes between D and R over the whole job: pulling forward to straighten up is one. */
  moves: number;
  last_drive: Gear | null;
  ms: number;
  contact: Vec | null;
  hit: Hit | null;
  loaded: boolean;
}

export function build_job(round: Pick<Round, "job" | "seed" | "difficulty">): Apron {
  if (round.job === Job.BAGGAGE) return build_baggage(round.seed, round.difficulty);
  if (round.job === Job.TURNAROUND) return build_baggage(round.seed, round.difficulty, { push: true });
  if (round.job === Job.TOW) return build_tow(round.seed, round.difficulty, TOW.hitches[0].hitch);
  return build_apron(round.seed, round.difficulty);
}

function phase_of(job: Job): Phase {
  if (job === Job.BAGGAGE || job === Job.TURNAROUND) return Phase.BAGS;
  return job === Job.TOW ? Phase.TOW : Phase.PUSH;
}

const SPECS: Record<Phase, VehicleSpec> = { bags: BAGGAGE, push: SPEC, tow: TOW };

function scene_of(apron: Apron, phase: Phase): Scene {
  return phase === Phase.BAGS ? { solids: [...apron.solids, ...apron.ours] } : apron;
}

function start_of(apron: Apron, phase: Phase) {
  return phase === Phase.BAGS ? apron.train!.start : apron.start;
}

export function create_game(round: Round): GameState {
  const apron = build_job(round);
  return enter(apron, round, phase_of(round.job));
}

function enter(apron: Apron, round: Round, phase: Phase): GameState {
  const spec = SPECS[phase];
  return {
    round,
    apron,
    phase,
    spec,
    scene: scene_of(apron, phase),
    car: create_car(start_of(apron, phase), Gear.PARK, spec),
    status: Status.READY,
    moves: 0,
    last_drive: null,
    ms: 0,
    contact: null,
    hit: null,
    loaded: false,
  };
}

/** Turnaround's second part: the train leaves with the kit, the pushback tug is at the nose, the clock waits for Start. */
export function swap_to_push(state: GameState): GameState {
  const next = enter(state.apron, state.round, Phase.PUSH);
  return { ...next, moves: state.moves, ms: state.ms, loaded: true };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export function aircraft_pose(car: Placement, spec: VehicleSpec = SPEC) {
  return trailer_pose(car, spec);
}

export function has_aircraft(phase: Phase): boolean {
  return phase !== Phase.BAGS;
}

export interface Contact {
  at: Vec;
  hit: Hit;
}

/** The ground and wing height, each its own broad phase. */
export interface Near {
  low: Obstacles;
  high: Obstacles;
}

export function near_of({ scene, apron }: Pick<GameState, "scene" | "apron">): Near {
  return { low: obstacles(scene), high: obstacles(apron.high) };
}

/** The tug and the aircraft's fuselage, engines and gear against the ground; its wings and tailplanes at wing height. */
export function contact(near: Near, apron: Apron, car: Placement, margin = 0, spec: VehicleSpec = SPEC): Contact | null {
  const tug = collide_shape(grow(corners(car, spec), margin), near.low);
  if (tug) return { at: tug.at, hit: { kind: apron.parts.get(tug.solid) ?? Part.TERMINAL, by: Ours.TUG } };
  const parts = aircraft_parts(aircraft_pose(car, spec), margin);
  for (let i = parts.length - 1; i >= 0; i--) {
    const found = collide_shape(parts[i], is_high(i) ? near.high : near.low);
    if (found)
      return { at: found.at, hit: { kind: apron.parts.get(found.solid) ?? Part.TERMINAL, by: SHAPES[i].part } };
  }
  return null;
}

function train_contact(near: Obstacles, apron: Apron, car: Placement): Contact | null {
  const found = collide(car, near, BAGGAGE);
  return found && { at: found.at, hit: { kind: apron.parts.get(found.solid) ?? Part.TERMINAL, by: Ours.TRAIN } };
}

/** `spec` is the rig's, passed in so the Creep setting can swap in its variant without creep. */
export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = state.spec): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  const folded = jackknife(car, state.spec);
  if (folded >= 0) {
    const aircraft = has_aircraft(state.phase);
    return {
      ...state,
      car: { ...car, speed: 0 },
      ms,
      status: Status.CRASHED,
      contact: aircraft ? nose_gear(aircraft_pose(car, state.spec)) : car,
      hit: aircraft ? { kind: STEERING, by: Ours.TUG } : { kind: JACKKNIFE, by: Ours.TRAIN, hinge: folded },
    };
  }
  const found =
    state.phase === Phase.BAGS
      ? train_contact(obstacles(state.scene), state.apron, car)
      : contact(near_of(state), state.apron, car, 0, state.spec);
  if (!found) return { ...state, car, ms };
  return { ...state, car: { ...car, speed: 0 }, ms, status: Status.CRASHED, contact: found.at, hit: found.hit };
}

export interface Judged {
  /** The nose gear past the stop mark (+) or short of it (−), along the way the aircraft moves onto it. */
  along: number;
  nose: number;
  main: number;
  angle: number;
}

/** The aircraft against its stop mark: pushed tail first onto the taxiway, or towed nose first up to the gate. */
export function judge(apron: Apron, car: Placement, spec: VehicleSpec = SPEC): Judged {
  const pose = aircraft_pose(car, spec);
  const gear = nose_gear(pose);
  const heading = apron.heading;
  const moving = spec.hitches[0].rest ? heading + Math.PI : heading;
  const off = (p: Vec) =>
    Math.abs(-(p.x - apron.stop.x) * Math.sin(heading) + (p.y - apron.stop.y) * Math.cos(heading));
  return {
    along: (gear.x - apron.stop.x) * Math.cos(moving) + (gear.y - apron.stop.y) * Math.sin(moving),
    nose: off(gear),
    main: off(pose),
    angle: angle_between(pose.heading, heading),
  };
}

export function is_done(judged: Judged): boolean {
  return (
    Math.abs(judged.along) <= STOP_ALONG &&
    judged.nose <= ON_LINE &&
    judged.main <= ON_LINE &&
    judged.angle <= MAX_ANGLE
  );
}

export function phase_done(state: Pick<GameState, "apron" | "phase" | "spec">, car: Placement): boolean {
  if (state.phase === Phase.BAGS)
    return train_done(judge_train(car, state.apron.train!.mark, state.apron.train!.heading));
  return is_done(judge(state.apron, car, state.spec));
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, state.spec);
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const moves = drives && state.last_drive !== null && state.last_drive !== gear ? state.moves + 1 : state.moves;
  const next: GameState = { ...state, car, moves, last_drive: drives ? gear : state.last_drive };
  if (gear !== Gear.PARK || !phase_done(state, car)) return next;
  if (state.round.job === Job.TURNAROUND && state.phase === Phase.BAGS) return swap_to_push(next);
  return { ...next, status: Status.DONE };
}

export function stop_hint(state: GameState): string | null {
  if (state.status !== Status.DRIVING || state.car.gear !== Gear.PARK || state.last_drive === null) return null;
  if (Math.abs(state.car.speed) >= STANDING) return null;
  if (state.phase === Phase.BAGS) {
    const train = state.apron.train!;
    const judged = judge_train(state.car, train.mark, train.heading);
    if (judged.angle > PARALLEL) return `Carts not lined up: ${degrees(judged.angle)}° off the aircraft`;
    if (judged.across > 0.7) return `Middle cart ${metres(judged.across)} m out from the hold door`;
    if (judged.along < 0) return `Middle cart ${metres(-judged.along)} m short of the hold door`;
    return `Middle cart ${metres(judged.along)} m past the hold door`;
  }
  const judged = judge(state.apron, state.car, state.spec);
  const towing = state.phase === Phase.TOW;
  if (judged.angle > MAX_ANGLE)
    return `Not lined up: ${degrees(judged.angle)}° off the ${towing ? "lead-in line" : "taxiway"}`;
  const off = Math.max(judged.nose, judged.main);
  if (off > ON_LINE) return `${metres(off)} m off the ${towing ? "lead-in line" : "centreline"}`;
  if (judged.along < -STOP_ALONG) return `Nose gear ${metres(-judged.along)} m short of the stop mark`;
  if (judged.along > STOP_ALONG) return `Nose gear ${metres(judged.along)} m past the stop mark`;
  return null;
}

function degrees(radians: number): string {
  return ((radians * 180) / Math.PI).toFixed(1);
}

function metres(value: number): string {
  return value.toFixed(1);
}

export function nose_steer(car: Placement, spec: VehicleSpec = SPEC): number {
  return ((folds(car, spec)[0] ?? 0) * 180) / Math.PI;
}

export function to_mark(state: GameState): number {
  if (state.phase === Phase.BAGS) {
    const judged = judge_train(state.car, state.apron.train!.mark, state.apron.train!.heading);
    return Math.hypot(judged.along, judged.across);
  }
  const { x, y } = nose_gear(aircraft_pose(state.car, state.spec));
  return Math.hypot(x - state.apron.stop.x, y - state.apron.stop.y);
}

export interface Par {
  ms: number;
}

export function stars(state: Pick<GameState, "moves" | "ms" | "status">, par_ms: number | null): 0 | 1 | 2 | 3 {
  if (state.status !== Status.DONE) return 0;
  const clean = state.moves === 0 ? 1 : 0;
  const quick = par_ms !== null && state.ms <= par_ms ? 1 : 0;
  return (1 + clean + quick) as 1 | 2 | 3;
}

export const result_schema = z.object({
  stars: z.number().int().min(1).max(3),
  ms: z.number().nonnegative(),
});
export type Result = z.infer<typeof result_schema>;

export const save_schema = z.object({
  best: z.record(z.string(), result_schema),
  levels: z.record(z.string(), z.record(z.string(), z.number().int().min(1).max(3))),
});
export type Save = z.infer<typeof save_schema>;
export const EMPTY_SAVE: Save = { best: {}, levels: {} };

export function better(a: Result | undefined, b: Result): boolean {
  if (!a) return true;
  return b.stars !== a.stars ? b.stars > a.stars : b.ms < a.ms;
}

export function round_key(round: Round): string {
  if (round.daily) return `daily:${round.daily}`;
  if (round.level !== undefined) return `${round.job}:level:${round.level}`;
  return `${round.job}:random`;
}

export interface Recorded {
  save: Save;
  improved: boolean;
  first: boolean;
}

export function record(save: Save, round: Round, result: Result): Recorded {
  const key = round_key(round);
  const old = save.best[key];
  const improved = better(old, result);
  const best = improved ? { ...save.best, [key]: result } : save.best;
  let levels = save.levels;
  if (round.level !== undefined) {
    const mine = save.levels[round.job] ?? {};
    levels = {
      ...save.levels,
      [round.job]: { ...mine, [round.level]: Math.max(mine[round.level] ?? 0, result.stars) },
    };
  }
  return { save: { best, levels }, improved, first: old === undefined };
}

export const LEVEL_COUNTS: Record<Job, number> = { pushback: 12, baggage: 8, tow: 8, turnaround: 8 };
const JOB_SALT: Record<Job, number> = { pushback: 0, baggage: 0xba6, tow: 0x70e, turnaround: 0x7a0 };

export function level_round(level: number, job: Job = Job.PUSHBACK): Round {
  const count = LEVEL_COUNTS[job];
  const index = Math.max(0, Math.min(count - 1, level - 1));
  const seed = job === Job.PUSHBACK ? hash(0x9b5c, index) : hash(0x9b5c, JOB_SALT[job], index);
  return { job, level: index + 1, difficulty: index / (count - 1), seed };
}

export function job_levels(save: Save, job: Job): Record<string, number> {
  return save.levels[job] ?? {};
}

export function unlocked(levels: Record<string, number>, job: Job = Job.PUSHBACK): number {
  let highest = 1;
  for (const key of Object.keys(levels)) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1) highest = Math.max(highest, level + 1);
  }
  return Math.min(LEVEL_COUNTS[job], highest);
}

export function random_round(seed: number, job: Job = Job.PUSHBACK): Round {
  return { job, seed, difficulty: ((hash(seed, 5) % 1000) / 1000) * 0.7 + 0.15 };
}

/** The daily is a turnaround: the whole job, the same for everyone. */
export function daily_round(day: string, seed: number): Round {
  return { job: Job.TURNAROUND, seed, difficulty: ((hash(seed, 7) % 1000) / 1000) * 0.5 + 0.3, daily: day };
}

const THEIRS: Record<Part, string> = {
  aircraft: "a parked aircraft",
  bridge: "a jet bridge",
  terminal: "the terminal",
  fence: "the blast fence",
  ours: "the aircraft you're loading",
  gpu: "a ground power unit",
  cone: "a cone",
  loader: "a belt loader",
};

const OURS: Record<Ours, string> = {
  tug: "The tug",
  train: "The baggage train",
  fuselage: "The fuselage",
  wing: "A wingtip",
  engine: "An engine",
  tailplane: "The tailplane",
  gear: "The main gear",
};

const ORDINALS = ["first", "second", "third"];

export function crash_title(hit: Hit | null): string {
  if (!hit) return "Touched something";
  if (hit.kind === STEERING) return "Nose gear past its steering lock";
  if (hit.kind === JACKKNIFE) return `Jackknifed at the ${ORDINALS[hit.hinge ?? 0] ?? "last"} hinge`;
  return `${OURS[hit.by]} touched ${THEIRS[hit.kind]}`;
}

export function round_title(round: Round): string {
  if (round.daily) return "Daily turnaround";
  if (round.level !== undefined) return `${JOB_NAMES[round.job]} · level ${round.level}`;
  return JOB_NAMES[round.job];
}

export function clearance(state: Pick<GameState, "apron" | "phase" | "round">): string {
  const { apron } = state;
  const stand = my_stand(apron).number;
  if (state.phase === Phase.BAGS)
    return `Bags for ${apron.callsign}, stand ${stand}, aft hold. Train cleared to the aircraft.`;
  if (state.phase === Phase.TOW)
    return `${apron.callsign}, tow approved, remote stand R${remote_stand(apron)} to stand ${stand}.`;
  return `${apron.callsign}, stand ${stand}, push back approved, face ${apron.face}.`;
}
