import { z } from "zod";
import { inside_convex, overlaps } from "../../core/collision";
import { angle_between, clamp, oriented_box, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { STANDING } from "../../core/keys";
import { collide_shape, obstacles, type Obstacles } from "../../core/obstacles";
import { inflate } from "../../core/planner";
import { fit, MAX_ANGLE, PERFECT, type Precision } from "../../core/precision";
import { SolidKind } from "../../core/scene";
import { hash } from "../../core/seed";
import {
  body_ends,
  bodies,
  create_car,
  FORKLIFT,
  Gear,
  shift,
  step,
  to_world,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "../../core/vehicle";
import { build_floor, PALLET, pallet_shape, type Floor, type Slot } from "./warehouse";

export { PERFECT };

export const Mode = { JOBS: "jobs", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.JOBS, Mode.LEVELS]);

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
  CRASHED: "crashed",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const SIZES = [1, 2, 3, 4] as const;
export const size_schema = z.number().int().min(1).max(4);

/**
 * The forks count as in a pallet's pockets only with both tines under it: off its centre by at most the room either
 * side of the fork spread, and square within the 5° a lift allows. Otherwise forks overlapping a pallet jam.
 */
export const JAM_ANGLE = MAX_ANGLE;
export const JAM_SIDE = (PALLET.width - (FORKLIFT.forks?.width ?? PALLET.width)) / 2;
/** Forks fully in: the mast within this of the pallet's face. */
export const FULL_GAP = 0.15;

export interface Round {
  mode: Mode;
  seed: number;
  difficulty: number;
  size: number;
  level?: number;
  daily?: string;
}

export interface Load {
  /** Where it rests; while carried, where it was picked up. */
  pose: Pose;
  /** Carried: its pose in the forklift's frame (it keeps the offset it was picked up with). */
  carried: Pose | null;
  placed: boolean;
}

export const JAM = "jam";
export type HitKind = SolidKind | typeof JAM;

export interface Hit {
  kind: HitKind;
  /** The carried pallet touched it, not the forklift. */
  by_load: boolean;
}

export interface GameState {
  round: Round;
  floor: Floor;
  car: Car;
  status: Status;
  /** Changes between D and R, as in parking. */
  moves: number;
  last_drive: Gear | null;
  ms: number;
  contact: Vec | null;
  hit: Hit | null;
  loads: Load[];
  /** The task in hand: every one before it is done. */
  current: number;
  /** One per pallet put down, in order. */
  drops: Precision[];
}

export const SPEC: VehicleSpec = FORKLIFT;

export function floor_for(round: Round): Floor {
  return build_floor(round.seed, round.difficulty, round.size);
}

export function create_game(round: Round): GameState {
  const floor = floor_for(round);
  return {
    round,
    floor,
    car: create_car(floor.start, Gear.PARK, SPEC),
    status: Status.READY,
    moves: 0,
    last_drive: null,
    ms: 0,
    contact: null,
    hit: null,
    loads: floor.tasks.map((task) => ({ pose: task.from.home, carried: null, placed: false })),
    current: 0,
    drops: [],
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export function load_pose(car: Pose, offset: Pose): Pose {
  return { ...to_world(car, offset), heading: car.heading + offset.heading };
}

export function offset_of(car: Pose, pose: Pose): Pose {
  const dx = pose.x - car.x;
  const dy = pose.y - car.y;
  const cos = Math.cos(car.heading);
  const sin = Math.sin(car.heading);
  return { x: dx * cos + dy * sin, y: -dx * sin + dy * cos, heading: pose.heading - car.heading };
}

export interface ForkFit {
  /** Off the pallet's axis, radians. */
  angle: number;
  /** The pallet's centre off the forks' centre line, metres. */
  side: number;
  /** From the mast to the pallet's face along its axis: 0 is fully in, a pallet length is the tips at the face. */
  gap: number;
}

export function fork_fit(car: Pose, pallet: Pose, spec: VehicleSpec = SPEC): ForkFit {
  const along = { x: Math.cos(pallet.heading), y: Math.sin(pallet.heading) };
  const mast = to_world(car, { x: body_ends(spec).front, y: 0 });
  const face = { x: pallet.x - (along.x * PALLET.length) / 2, y: pallet.y - (along.y * PALLET.length) / 2 };
  const side = -(pallet.x - car.x) * Math.sin(car.heading) + (pallet.y - car.y) * Math.cos(car.heading);
  return {
    angle: angle_between(car.heading, pallet.heading),
    side,
    gap: (face.x - mast.x) * along.x + (face.y - mast.y) * along.y,
  };
}

export function in_pockets(at: ForkFit): boolean {
  return at.angle <= JAM_ANGLE && Math.abs(at.side) <= JAM_SIDE;
}

export function can_lift(at: ForkFit): boolean {
  return in_pockets(at) && at.gap <= FULL_GAP;
}

export function placed_in(pose: Pose, slot: Slot): boolean {
  return angle_between(pose.heading, slot.heading) <= MAX_ANGLE && pallet_shape(pose).every((corner) => inside_convex(corner, slot.shape));
}

export function drop_fit(pose: Pose, slot: Slot): Precision {
  return fit(pallet_shape(pose), [pose.heading], { shape: slot.shape, heading: slot.heading, either: false });
}

/** Where the carried pallet is now, or null when the forks are empty. */
export function carried_pose(state: Pick<GameState, "car" | "loads">): Pose | null {
  const load = state.loads.find((each) => each.carried);
  return load?.carried ? load_pose(state.car, load.carried) : null;
}

export function resting(loads: readonly Load[]): Pose[] {
  return loads.filter((load) => !load.carried).map((load) => load.pose);
}

const grown_specs = new WeakMap<VehicleSpec, Map<number, VehicleSpec>>();

// The planner asks millions of times with one margin; growing the spec each time was most of its cost.
function grown_spec(spec: VehicleSpec, margin: number): VehicleSpec {
  let sizes = grown_specs.get(spec);
  if (!sizes) grown_specs.set(spec, (sizes = new Map()));
  let found = sizes.get(margin);
  if (!found) sizes.set(margin, (found = inflate(spec, margin)));
  return found;
}

export interface Contact extends Hit {
  at: Vec;
}

/**
 * The forklift's body and forks against the warehouse and the job's pallets, then the load it carries. The forks may be
 * in a pallet's pockets; anything else touching is a contact. `margin` grows every body, for the planner.
 */
export function contact(
  near: Obstacles,
  loads: readonly Pose[],
  car: Placement,
  load: Pose | null,
  margin = 0,
  spec: VehicleSpec = SPEC
): Contact | null {
  const grown = margin > 0 ? grown_spec(spec, margin) : spec;
  const [body, forks] = bodies(car, grown);
  for (const shape of forks ? [body, forks] : [body]) {
    const hit = collide_shape(shape, near);
    if (hit) return { kind: hit.solid.kind, at: hit.at, by_load: false };
  }
  for (const pose of loads) {
    const shape = pallet_shape(pose);
    if (overlaps(body, shape)) return { kind: SolidKind.PALLET, at: midpoint(body, shape), by_load: false };
    if (forks && overlaps(forks, shape) && !in_pockets(fork_fit(car, pose, spec))) return { kind: JAM, at: midpoint(forks, shape), by_load: false };
  }
  if (!load) return null;
  const carried = oriented_box(load.x, load.y, load.heading, PALLET.length + margin * 2, PALLET.width + margin * 2);
  const hit = collide_shape(carried, near);
  if (hit) return { kind: hit.solid.kind, at: hit.at, by_load: true };
  for (const pose of loads) {
    const shape = pallet_shape(pose);
    if (overlaps(carried, shape)) return { kind: SolidKind.PALLET, at: midpoint(carried, shape), by_load: true };
  }
  return null;
}

function midpoint(a: Polygon, b: Polygon): Vec {
  const centre = (shape: Polygon) => shape.reduce((sum, p) => ({ x: sum.x + p.x / shape.length, y: sum.y + p.y / shape.length }), { x: 0, y: 0 });
  const p = centre(a);
  const q = centre(b);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

/** `spec` is the forklift's, passed in so the Creep setting can swap in its variant without creep. */
export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec = SPEC): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  const load = carried_pose({ car, loads: state.loads });
  const hit = contact(obstacles(state.floor), resting(state.loads), car, load, 0, spec);
  if (!hit) return { ...state, car, ms };
  return { ...state, car: { ...car, speed: 0 }, ms, status: Status.CRASHED, contact: hit.at, hit: { kind: hit.kind, by_load: hit.by_load } };
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, SPEC);
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const moves = drives && state.last_drive !== null && state.last_drive !== gear ? state.moves + 1 : state.moves;
  return { ...state, car, moves, last_drive: drives ? gear : state.last_drive };
}

export const ForkAction = { LIFT: "lift", LOWER: "lower" } as const;
export type ForkAction = (typeof ForkAction)[keyof typeof ForkAction];

/** What the Fork control would do now: lift with the forks fully and squarely in, lower over the target, else nothing. */
export function fork_action(state: GameState): ForkAction | null {
  if (state.status !== Status.DRIVING || Math.abs(state.car.speed) >= STANDING) return null;
  const load = state.loads[state.current];
  const task = state.floor.tasks[state.current];
  if (!load || !task) return null;
  if (load.carried) return placed_in(load_pose(state.car, load.carried), task.to) ? ForkAction.LOWER : null;
  return can_lift(fork_fit(state.car, load.pose)) ? ForkAction.LIFT : null;
}

export function use_fork(state: GameState): GameState {
  const action = fork_action(state);
  if (!action) return state;
  const at = state.current;
  const load = state.loads[at];
  if (action === ForkAction.LIFT) {
    const loads = state.loads.map((each, i) => (i === at ? { ...each, carried: offset_of(state.car, each.pose) } : each));
    return { ...state, loads, car: { ...state.car, speed: 0 } };
  }
  const pose = load_pose(state.car, load.carried!);
  const loads = state.loads.map((each, i) => (i === at ? { pose, carried: null, placed: true } : each));
  const drops = [...state.drops, drop_fit(pose, state.floor.tasks[at].to)];
  const current = at + 1;
  const done = current >= state.floor.tasks.length;
  return { ...state, loads, drops, current, car: { ...state.car, speed: 0 }, status: done ? Status.DONE : state.status };
}

// How far off a pallet the forks may stand for the hint to say how to line up.
const LINE_UP_ANGLE = (25 * Math.PI) / 180;
const LINE_UP_SIDE = 0.5;

/** Why the Fork control is off, once the forklift stands at the pallet or carries one near its target. */
export function fork_hint(state: GameState): string | null {
  if (state.status !== Status.DRIVING || Math.abs(state.car.speed) >= STANDING) return null;
  const load = state.loads[state.current];
  const task = state.floor.tasks[state.current];
  if (!load || !task) return null;
  if (load.carried) {
    const pose = load_pose(state.car, load.carried);
    if (Math.hypot(pose.x - task.to.home.x, pose.y - task.to.home.y) > 2.2) return null;
    const off = angle_between(pose.heading, task.to.heading);
    if (off > MAX_ANGLE) return `Not straight: ${degrees(off)}° off`;
    return placed_in(pose, task.to) ? null : `Not inside ${task.to.name} yet`;
  }
  const at = fork_fit(state.car, load.pose);
  if (at.gap > PALLET.length + 0.6) return null;
  if (in_pockets(at)) return at.gap > FULL_GAP ? "Drive the forks fully in" : null;
  // Short of the pallet and off its pockets: say how before the tines go in and jam.
  if (at.gap <= PALLET.length || at.angle > LINE_UP_ANGLE || Math.abs(at.side) > LINE_UP_SIDE) return null;
  if (at.angle > JAM_ANGLE) return `Line up: ${degrees(at.angle)}° off`;
  return `Line up: pallet ${Math.round(Math.abs(at.side) * 100)} cm to the ${at.side > 0 ? "right" : "left"}`;
}

function degrees(radians: number): string {
  return ((radians * 180) / Math.PI).toFixed(1);
}

/** How far the forks are into the pallet in hand, 0 to 1, while they're in its pockets. */
export function fork_depth(state: GameState): number | null {
  const load = state.loads[state.current];
  if (!load || load.carried || state.status !== Status.DRIVING) return null;
  const at = fork_fit(state.car, load.pose);
  if (!in_pockets(at) || at.gap > PALLET.length) return null;
  return clamp(1 - at.gap / PALLET.length, 0, 1);
}

/** Where the player should head now: the pallet in hand, or its target once it's on the forks. */
export function objective(state: GameState): Slot | null {
  const task = state.floor.tasks[state.current];
  const load = state.loads[state.current];
  if (!task || !load) return null;
  return load.carried ? task.to : task.from;
}

export interface Par {
  ms: number;
}

/**
 * Every pallet takes four drives at least (in to it, back out, in to its target, back out) and the last needs no
 * backing out; one more each for lining up in a tight aisle.
 */
export function par_moves(pallets: number): number {
  return pallets * 5 - 2;
}

/** One for the job done, one for the moves at or under par, one for the time at or under the planner's par time. */
export function stars(state: Pick<GameState, "moves" | "ms" | "status" | "round">, par_ms: number | null): 0 | 1 | 2 | 3 {
  if (state.status !== Status.DONE) return 0;
  const moves = state.moves <= par_moves(state.round.size) ? 1 : 0;
  const quick = par_ms !== null && state.ms <= par_ms ? 1 : 0;
  return (1 + moves + quick) as 1 | 2 | 3;
}

export function average_precision(drops: readonly Precision[]): number | null {
  if (drops.length === 0) return null;
  return drops.reduce((sum, drop) => sum + drop.score, 0) / drops.length;
}

export const result_schema = z.object({
  stars: z.number().int().min(1).max(3),
  ms: z.number().nonnegative(),
  precision: z.number().min(0).max(100).optional(),
});
export type Result = z.infer<typeof result_schema>;
export const bests_schema = z.record(z.string(), result_schema);
export type Bests = z.infer<typeof bests_schema>;

/** More stars, then quicker. */
export function better(a: Result | undefined, b: Result): boolean {
  if (!a) return true;
  return b.stars !== a.stars ? b.stars > a.stars : b.ms < a.ms;
}

export function round_key(round: Round): string {
  if (round.daily) return `daily:${round.daily}`;
  if (round.level !== undefined) return `level:${round.level}`;
  return `jobs:${round.size}`;
}

export interface Recorded {
  bests: Bests;
  improved: boolean;
  first: boolean;
}

/** The order is stars, then time; precision only ever rises, whichever run set it. */
export function record_best(bests: Bests, round: Round, result: Result): Recorded {
  const key = round_key(round);
  const old = bests[key];
  const improved = better(old, result);
  const run = improved ? { stars: result.stars, ms: result.ms } : { stars: old!.stars, ms: old!.ms };
  const top = Math.max(old?.precision ?? -1, result.precision ?? -1);
  return { bests: { ...bests, [key]: top >= 0 ? { ...run, precision: top } : run }, improved, first: old === undefined };
}

export const levels_schema = z.record(z.string(), z.number().int().min(1).max(3));
export type LevelStars = z.infer<typeof levels_schema>;

const PER_SIZE = 4;
export const LEVEL_COUNT = SIZES.length * PER_SIZE;

/** Four levels per job size, one to four pallets, each set tighter than the last. */
export function level_round(level: number): Round {
  const index = Math.max(0, Math.min(LEVEL_COUNT - 1, level - 1));
  return {
    mode: Mode.LEVELS,
    level: index + 1,
    size: SIZES[Math.floor(index / PER_SIZE)],
    difficulty: index / (LEVEL_COUNT - 1),
    seed: hash(0xf02c, index),
  };
}

export function unlocked(levels: LevelStars): number {
  let highest = 1;
  for (const key of Object.keys(levels)) {
    const level = Number(key);
    if (Number.isInteger(level) && level >= 1) highest = Math.max(highest, level + 1);
  }
  return Math.min(LEVEL_COUNT, highest);
}

export function job_round(size: number, seed: number): Round {
  return { mode: Mode.JOBS, seed, size, difficulty: ((hash(seed, 5) % 1000) / 1000) * 0.7 + 0.15 };
}

export const DAILY_SIZE = 3;

export function daily_round(day: string, seed: number): Round {
  return { mode: Mode.JOBS, seed, size: DAILY_SIZE, difficulty: ((hash(seed, 7) % 1000) / 1000) * 0.5 + 0.3, daily: day };
}

const HIT_NAMES: Record<SolidKind, string> = {
  car: "a car",
  wall: "a wall",
  pillar: "a pillar",
  kerb: "the kerb",
  shelf: "a shelf",
  water: "the water",
  post: "a post",
  rack: "a rack",
  pallet: "a pallet",
};

export function crash_title(hit: Hit | null): string {
  if (!hit) return "Touched something";
  if (hit.kind === JAM) return "Jammed the forks into a pallet";
  return hit.by_load ? `The load touched ${HIT_NAMES[hit.kind]}` : `Touched ${HIT_NAMES[hit.kind]}`;
}

export function round_title(round: Round): string {
  const pallets = `${round.size} ${round.size === 1 ? "pallet" : "pallets"}`;
  if (round.daily) return `Daily job · ${pallets}`;
  if (round.level !== undefined) return `Level ${round.level} · ${pallets}`;
  return `Job · ${pallets}`;
}

/** "Pallet 2/3 → Dock B", or the pick-up while the forks are empty. */
export function task_line(state: GameState): string | null {
  const task = state.floor.tasks[state.current];
  const load = state.loads[state.current];
  if (!task || !load) return null;
  const count = `Pallet ${state.current + 1}/${state.floor.tasks.length}`;
  return load.carried ? `${count} → ${task.to.name}` : `${count} · pick up at ${task.from.name}`;
}
