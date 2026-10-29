import { z } from "zod";
import { angle_between, type Vec } from "../../core/geometry";
import { STANDING } from "../../core/keys";
import { collide_shape, obstacles, type Obstacles } from "../../core/obstacles";
import { hash } from "../../core/seed";
import {
  corners,
  create_car,
  folds,
  Gear,
  jackknifed,
  PUSHBACK,
  shift,
  step,
  trailer_pose,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "../../core/vehicle";
import { AircraftPart, aircraft_parts, grow, nose_gear, SHAPES } from "./aircraft";
import { build_apron, Part, type Apron } from "./apron";

export const Mode = { PUSHES: "pushes", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.PUSHES, Mode.LEVELS]);

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

export const STOP_ALONG = 1;
export const ON_LINE = 0.5;
export const MAX_ANGLE = (5 * Math.PI) / 180;

export interface Round {
  mode: Mode;
  seed: number;
  difficulty: number;
  level?: number;
  daily?: string;
}

export const Ours = { TUG: "tug", ...AircraftPart } as const;
export type Ours = (typeof Ours)[keyof typeof Ours];

export const STEERING = "steering";

export interface Hit {
  kind: Part | typeof STEERING;
  by: Ours;
}

export interface GameState {
  round: Round;
  apron: Apron;
  car: Car;
  status: Status;
  /** Changes between D and R: pulling forward to straighten up is one. */
  moves: number;
  last_drive: Gear | null;
  ms: number;
  contact: Vec | null;
  hit: Hit | null;
}

export function create_game(round: Round): GameState {
  const apron = build_apron(round.seed, round.difficulty);
  return {
    round,
    apron,
    car: create_car(apron.start, Gear.PARK, SPEC),
    status: Status.READY,
    moves: 0,
    last_drive: null,
    ms: 0,
    contact: null,
    hit: null,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export function aircraft_pose(car: Placement) {
  return trailer_pose(car, SPEC);
}

function tug_body(car: Placement, margin: number): Vec[] {
  return grow(corners(car, SPEC), margin);
}

export interface Contact {
  at: Vec;
  hit: Hit;
}

export function contact(near: Obstacles, apron: Apron, car: Placement, margin = 0): Contact | null {
  const tug = collide_shape(tug_body(car, margin), near);
  if (tug) return { at: tug.at, hit: { kind: apron.parts.get(tug.solid) ?? Part.TERMINAL, by: Ours.TUG } };
  const parts = aircraft_parts(aircraft_pose(car), margin);
  for (let i = parts.length - 1; i >= 0; i--) {
    const found = collide_shape(parts[i], near);
    if (found) return { at: found.at, hit: { kind: apron.parts.get(found.solid) ?? Part.TERMINAL, by: SHAPES[i].part } };
  }
  return null;
}

/** `spec` is the rig's, passed in so the Creep setting can swap in its variant without creep. */
export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = SPEC): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  if (jackknifed(car, spec)) {
    return {
      ...state,
      car: { ...car, speed: 0 },
      ms,
      status: Status.CRASHED,
      contact: nose_gear(aircraft_pose(car)),
      hit: { kind: STEERING, by: Ours.TUG },
    };
  }
  const found = contact(obstacles(state.apron), state.apron, car);
  if (!found) return { ...state, car, ms };
  return { ...state, car: { ...car, speed: 0 }, ms, status: Status.CRASHED, contact: found.at, hit: found.hit };
}

export interface Judged {
  /** The nose gear past the stop mark (+) or short of it (−), along the way the aircraft is pushed. */
  along: number;
  nose: number;
  main: number;
  angle: number;
}

export function judge(apron: Apron, car: Placement): Judged {
  const pose = aircraft_pose(car);
  const gear = nose_gear(pose);
  const back = apron.heading + Math.PI;
  return {
    along: (gear.x - apron.stop.x) * Math.cos(back) + (gear.y - apron.stop.y) * Math.sin(back),
    nose: Math.abs(gear.y - apron.centreline),
    main: Math.abs(pose.y - apron.centreline),
    angle: angle_between(pose.heading, apron.heading),
  };
}

export function is_done(judged: Judged): boolean {
  return Math.abs(judged.along) <= STOP_ALONG && judged.nose <= ON_LINE && judged.main <= ON_LINE && judged.angle <= MAX_ANGLE;
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, SPEC);
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const moves = drives && state.last_drive !== null && state.last_drive !== gear ? state.moves + 1 : state.moves;
  const next: GameState = { ...state, car, moves, last_drive: drives ? gear : state.last_drive };
  if (gear !== Gear.PARK || !is_done(judge(state.apron, car))) return next;
  return { ...next, status: Status.DONE };
}

export function stop_hint(state: GameState): string | null {
  if (state.status !== Status.DRIVING || state.car.gear !== Gear.PARK || state.last_drive === null) return null;
  if (Math.abs(state.car.speed) >= STANDING) return null;
  const judged = judge(state.apron, state.car);
  if (judged.angle > MAX_ANGLE) return `Not lined up: ${degrees(judged.angle)}° off the taxiway`;
  const off = Math.max(judged.nose, judged.main);
  if (off > ON_LINE) return `${metres(off)} m off the centreline`;
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

export function nose_steer(car: Placement): number {
  return ((folds(car, SPEC)[0] ?? 0) * 180) / Math.PI;
}

export function to_mark(state: GameState): number {
  const { x, y } = nose_gear(aircraft_pose(state.car));
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
  levels: z.record(z.string(), z.number().int().min(1).max(3)),
});
export type Save = z.infer<typeof save_schema>;
export const EMPTY_SAVE: Save = { best: {}, levels: {} };

export function better(a: Result | undefined, b: Result): boolean {
  if (!a) return true;
  return b.stars !== a.stars ? b.stars > a.stars : b.ms < a.ms;
}

export function round_key(round: Round): string {
  if (round.daily) return `daily:${round.daily}`;
  if (round.level !== undefined) return `level:${round.level}`;
  return "pushes";
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
  const levels = round.level === undefined ? save.levels : { ...save.levels, [round.level]: Math.max(save.levels[round.level] ?? 0, result.stars) };
  return { save: { best, levels }, improved, first: old === undefined };
}

export const LEVEL_COUNT = 12;

export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  return { mode: Mode.LEVELS, level: index + 1, difficulty: index / (LEVEL_COUNT - 1), seed: hash(0x9b5c, index) };
}

export function unlocked(levels: Save["levels"]): number {
  let highest = 1;
  for (const key of Object.keys(levels)) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1) highest = Math.max(highest, level + 1);
  }
  return Math.min(LEVEL_COUNT, highest);
}

export function push_round(seed: number): Round {
  return { mode: Mode.PUSHES, seed, difficulty: ((hash(seed, 5) % 1000) / 1000) * 0.7 + 0.15 };
}

export function daily_round(day: string, seed: number): Round {
  return { mode: Mode.PUSHES, seed, difficulty: ((hash(seed, 7) % 1000) / 1000) * 0.5 + 0.3, daily: day };
}

const THEIRS: Record<Part, string> = {
  aircraft: "a parked aircraft",
  bridge: "a jet bridge",
  terminal: "the terminal",
  fence: "the blast fence",
};

const OURS: Record<Ours, string> = {
  tug: "The tug",
  fuselage: "The fuselage",
  wing: "A wingtip",
  engine: "An engine",
  tailplane: "The tailplane",
};

export function crash_title(hit: Hit | null): string {
  if (!hit) return "Touched something";
  if (hit.kind === STEERING) return "Nose gear past its steering lock";
  return `${OURS[hit.by]} touched ${THEIRS[hit.kind]}`;
}

export function round_title(round: Round): string {
  if (round.daily) return "Daily push";
  if (round.level !== undefined) return `Level ${round.level}`;
  return "Pushback";
}
