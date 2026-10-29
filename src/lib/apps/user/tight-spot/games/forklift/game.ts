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
import { build_floor, PALLET, pallet_shape, slot_label, type Floor, type Slot } from "./warehouse";

export { PERFECT };

export const Mode = { JOBS: "jobs", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.JOBS, Mode.LEVELS]);

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const SIZES = [1, 2, 3, 4] as const;
export const size_schema = z.number().int().min(1).max(4);

/** The room either side of the fork spread under a pallet: both tines under it with its centre this far off at most. */
export const FORK_ROOM = (PALLET.width - (FORKLIFT.forks?.width ?? PALLET.width)) / 2;
/**
 * The forks count as in a pallet's pockets within 10° of its axis and 15 cm of its centre, more than the fork spread
 * strictly allows: forks slide under a pallet a little off, and a game should forgive it. Past that they jam.
 */
export const JAM_ANGLE = (10 * Math.PI) / 180;
export const JAM_SIDE = 0.15;
/** Forks fully in: the mast within this of the pallet's face. */
export const FULL_GAP = 0.15;
/** At an upper tier the forklift stands at the rack face, the fork tips (or the load's front) at most this short of it. */
export const STANDOFF = 1;
/** A height miss within this goes in clean; up to `MISS` it scrapes; past that it hits. */
export const CLEAN = 0.04;
export const MISS = 0.1;
/** A bump holds the forklift where it was; pressing on is the same bump until it has backed off this far. */
export const BUMP_CLEAR = 0.3;
/** How long the contact rings flash after a bump, ms. */
export const BUMP_FLASH_MS = 1200;
/** What a bump adds to the round's time, ms. */
export const BUMP_COST_MS = 5000;

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
  /** The tier it rests on, 0 the floor; while carried, the one it was lifted from. */
  tier: number;
  /** Metres off the pocket height the forks went in at, lifting it off an upper tier; 0 off the floor. */
  miss: number;
  /** Carried: its pose in the forklift's frame (it keeps the offset it was picked up with). */
  carried: Pose | null;
  placed: boolean;
}

export const JAM = "jam";
export const BEAM = "beam";
export type HitKind = SolidKind | typeof JAM | typeof BEAM;

export interface Hit {
  kind: HitKind;
  /** The carried pallet touched it, not the forklift. */
  by_load: boolean;
}

export interface Bump extends Hit {
  /** Where the forklift stood when it bumped. */
  from: Vec;
  /** At the rack, the fork height off the ideal that hit going in; null for any other bump. */
  miss: number | null;
}

export interface Drop extends Precision {
  /** The worse height miss of its lift and its put-down, metres; 0 off and onto the floor. */
  miss: number;
}

export const SideKind = { PICK: "pick", DROP: "drop" } as const;
export type SideKind = (typeof SideKind)[keyof typeof SideKind];

/** The side view at an upper tier: the forks' height and how they went in, while the forklift stands at the rack. */
export interface SideView {
  slot: Slot;
  kind: SideKind;
  /** The forks' underside above the floor, metres. */
  lift: number;
  /** Where the view opened: the forks back out no further. */
  from: Placement;
  /** Fork height off the ideal the moment the tips (or the load) went in; null while they're out. */
  miss: number | null;
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
  /** Where the last bump touched. */
  contact: Vec | null;
  loads: Load[];
  /** The task in hand: every one before it is done. */
  current: number;
  /** One per pallet put down, in order. */
  drops: Drop[];
  /** The rack slot the forks are still raised into after a lift or put-down there, until they're out of it. */
  raised: Slot | null;
  side: SideView | null;
  /** The bump the forklift is still up against, until it has backed off `BUMP_CLEAR` (at the rack, or fixed the height). */
  bumped: Bump | null;
  /** Bumps this round, each `BUMP_COST_MS` on the clock. */
  bumps: number;
  /** The round's clock just after the last bump, for the flash. */
  bump_ms: number;
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
    loads: floor.tasks.map((task) => ({ pose: task.from.home, tier: task.from.tier, miss: 0, carried: null, placed: false })),
    current: 0,
    drops: [],
    raised: null,
    side: null,
    bumped: null,
    bumps: 0,
    bump_ms: 0,
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

/**
 * Precision of a put-down: `fit()` against the slot, times 1 − e² for each height miss (its share of `MISS`), the way
 * `fit()` scores each of its errors.
 */
export function drop_fit(pose: Pose, slot: Slot, misses: readonly number[] = []): Drop {
  const placed = fit(pallet_shape(pose), [pose.heading], { shape: slot.shape, heading: slot.heading, either: false });
  const shares = misses.map((miss) => clamp(Math.abs(miss) / MISS, 0, 1));
  const score = shares.reduce((product, e) => product * (1 - e * e), placed.score);
  return { ...placed, score, miss: Math.max(0, ...misses.map(Math.abs)) };
}

/** Room either side of a pallet across the slot. */
export function side_room(slot: Slot): number {
  const xs = slot.shape.map((p) => p.x);
  const ys = slot.shape.map((p) => p.y);
  const across = Math.abs(Math.cos(slot.heading)) > 0.5 ? Math.max(...ys) - Math.min(...ys) : Math.max(...xs) - Math.min(...xs);
  return Math.max(0.02, (across - PALLET.width) / 2);
}

/** How far a pallet still has to go along the slot's axis to sit where a stored one does: a pallet length is its front at the slot's face. */
export function depth_to(pose: Pose, slot: Slot): number {
  return (slot.home.x - pose.x) * Math.cos(slot.heading) + (slot.home.y - pose.y) * Math.sin(slot.heading);
}

export function along(pose: Placement, distance: number): Placement {
  return { x: pose.x + Math.cos(pose.heading) * distance, y: pose.y + Math.sin(pose.heading) * distance, heading: pose.heading };
}

/** Standing at an upper slot's face with the forks in line with the pallet's pockets, the tips short of it. */
export function at_pick_face(at: ForkFit): boolean {
  return in_pockets(at) && at.gap >= PALLET.length && at.gap <= PALLET.length + STANDOFF;
}

/** Standing at an upper slot's face with the load square to it, its front short of it, and a straight run in would put it inside. */
export function at_drop_face(car: Placement, offset: Pose, slot: Slot): boolean {
  const pose = load_pose(car, offset);
  const depth = depth_to(pose, slot);
  if (angle_between(pose.heading, slot.heading) > MAX_ANGLE || depth < PALLET.length || depth > PALLET.length + STANDOFF) return false;
  return placed_in(load_pose(along(car, depth / Math.max(0.5, Math.cos(angle_between(car.heading, slot.heading)))), offset), slot);
}

/** Where the carried pallet is now, or null when the forks are empty. */
export function carried_pose(state: Pick<GameState, "car" | "loads">): Pose | null {
  const load = state.loads.find((each) => each.carried);
  return load?.carried ? load_pose(state.car, load.carried) : null;
}

export interface Resting {
  pose: Pose;
  tier: number;
}

export function resting(loads: readonly Load[]): Resting[] {
  return loads.filter((load) => !load.carried).map((load) => ({ pose: load.pose, tier: load.tier }));
}

/** The fixed solids, and the stock of each tier: the body meets the floor's, the forks and the load the tier they're at. */
export interface Near {
  base: Obstacles;
  shelves: Obstacles[];
}

const near_cache = new WeakMap<Floor, Near>();

export function near_of(floor: Floor): Near {
  let found = near_cache.get(floor);
  if (!found) near_cache.set(floor, (found = { base: obstacles(floor), shelves: floor.shelves.map(obstacles) }));
  return found;
}

function carried_box(load: Pose, margin: number): Polygon {
  return oriented_box(load.x, load.y, load.heading, PALLET.length + margin * 2, PALLET.width + margin * 2);
}

/** The tier the forks and the load are at: `raised`'s while either still reaches into its slot, else the floor. */
export function fork_tier(raised: Slot | null, forks: Polygon | null, carried: Polygon | null): number {
  if (!raised) return 0;
  return (forks && overlaps(forks, raised.shape)) || (carried && overlaps(carried, raised.shape)) ? raised.tier : 0;
}

/** The forks stay raised into a slot until neither they nor the load reach into it, then go down to travel. */
export function settle_raised(raised: Slot | null, car: Placement, load: Pose | null, spec: VehicleSpec = SPEC): Slot | null {
  if (!raised) return null;
  const [, forks] = bodies(car, spec);
  return fork_tier(raised, forks ?? null, load ? carried_box(load, 0) : null) > 0 ? raised : null;
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

function first_hit(shape: Polygon, near: Near, tier: number) {
  return collide_shape(shape, near.base) ?? (near.shelves[tier] ? collide_shape(shape, near.shelves[tier]) : null);
}

/**
 * The forklift's body and forks against the warehouse and the job's pallets, then the load it carries. The body meets
 * the floor's stock and every job pallet; the forks and the load only what stands at their tier (`fork_tier`: raised
 * into `raised` while they reach into it). The forks may be in a pallet's pockets; anything else touching is a contact.
 * `margin` grows every body, for the planner.
 */
export function contact(
  near: Near,
  loads: readonly Resting[],
  car: Placement,
  load: Pose | null,
  raised: Slot | null = null,
  margin = 0,
  spec: VehicleSpec = SPEC
): Contact | null {
  const grown = margin > 0 ? grown_spec(spec, margin) : spec;
  const [body, forks] = bodies(car, grown);
  const carried = load ? carried_box(load, margin) : null;
  const tier = fork_tier(raised, forks ?? null, carried);
  const body_hit = first_hit(body, near, 0);
  if (body_hit) return { kind: body_hit.solid.kind, at: body_hit.at, by_load: false };
  const fork_hit = forks ? first_hit(forks, near, tier) : null;
  if (fork_hit) return { kind: fork_hit.solid.kind, at: fork_hit.at, by_load: false };
  for (const each of loads) {
    const shape = pallet_shape(each.pose);
    if (overlaps(body, shape)) return { kind: SolidKind.PALLET, at: midpoint(body, shape), by_load: false };
    if (each.tier !== tier) continue;
    if (forks && overlaps(forks, shape) && !in_pockets(fork_fit(car, each.pose, spec))) return { kind: JAM, at: midpoint(forks, shape), by_load: false };
  }
  if (!carried) return null;
  const hit = first_hit(carried, near, tier);
  if (hit) return { kind: hit.solid.kind, at: hit.at, by_load: true };
  for (const each of loads) {
    if (each.tier !== tier) continue;
    const shape = pallet_shape(each.pose);
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
  if (state.status !== Status.DRIVING || state.side) return state;
  const car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  const load = carried_pose({ car, loads: state.loads });
  const hit = contact(near_of(state.floor), resting(state.loads), car, load, state.raised, 0, spec);
  if (hit && end_stop(state, hit)) return { ...state, car: { ...state.car, speed: 0 }, ms };
  if (hit) return bump(state, ms, hit);
  const bumped = state.bumped && Math.hypot(car.x - state.bumped.from.x, car.y - state.bumped.from.y) <= BUMP_CLEAR ? state.bumped : null;
  return { ...state, car, ms, bumped, raised: settle_raised(state.raised, car, load, spec) };
}

/**
 * Nothing ends a round: a contact is a bump. The step is undone (the forklift and any load stay where they were,
 * stopped, in gear) and the first bump against something costs `BUMP_COST_MS`; pressing on is the same bump.
 */
export function bump(state: GameState, ms: number, hit: Contact, miss: number | null = null): GameState {
  const car = { ...state.car, speed: 0 };
  if (state.bumped) return { ...state, car, ms, contact: hit.at };
  const cost = ms + BUMP_COST_MS;
  const bumped: Bump = { kind: hit.kind, by_load: hit.by_load, from: { x: car.x, y: car.y }, miss };
  return { ...state, car, ms: cost, contact: hit.at, bumped, bumps: state.bumps + 1, bump_ms: cost };
}

/**
 * A pallet where the job wants the forklift to stop is an end stop, not a bump: the mast against the pallet in hand with
 * the forks fully in its pockets, or, lined up at an upper slot's face, the forks or load at travel height against the
 * stock on the floor under it (hidden by the pallet drawn above), where the side view opens.
 */
function end_stop(state: GameState, hit: Contact): boolean {
  if (hit.kind !== SolidKind.PALLET || state.raised) return false;
  const load = state.loads[state.current];
  const task = state.floor.tasks[state.current];
  if (!load || !task) return false;
  if (load.carried) return task.to.tier > 0 && at_drop_face(state.car, load.carried, task.to);
  const at = fork_fit(state.car, load.pose);
  return load.tier > 0 ? at_pick_face(at) : in_pockets(at) && at.gap <= FULL_GAP;
}

/** The contact rings flash for a moment after a bump. */
export function bump_flash(state: Pick<GameState, "bumps" | "bump_ms" | "ms" | "contact">): boolean {
  return state.bumps > 0 && state.contact !== null && state.ms - state.bump_ms < BUMP_FLASH_MS;
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
  hedge: "a hedge",
};

/** What the forklift is up against and how to get off it: "Bumped a rack: back off". */
export function bump_hint(state: Pick<GameState, "bumped" | "status">): string | null {
  const hit = state.bumped;
  if (!hit || state.status !== Status.DRIVING) return null;
  if (hit.miss !== null) {
    const what = hit.kind === JAM ? "Jammed" : hit.by_load ? "The load hit the beam" : "The forks hit the beam";
    return `${what}: ${hit.miss > 0 ? "lower" : "raise"} the forks`;
  }
  if (hit.kind === JAM) return "Jammed: back out";
  if (hit.kind === BEAM) return hit.by_load ? "The load hit the beam: back off" : "The forks hit the beam: back off";
  return `${hit.by_load ? "The load bumped" : "Bumped"} ${HIT_NAMES[hit.kind]}: back off`;
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING || state.side) return state;
  const car = shift(state.car, gear, SPEC);
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const moves = drives && state.last_drive !== null && state.last_drive !== gear ? state.moves + 1 : state.moves;
  return { ...state, car, moves, last_drive: drives ? gear : state.last_drive };
}

/** Lift and lower happen on the floor; at an upper tier the Fork control opens the side view (`rack`), where they happen. */
export const ForkAction = { LIFT: "lift", LOWER: "lower", RACK: "rack" } as const;
export type ForkAction = (typeof ForkAction)[keyof typeof ForkAction];

/**
 * What the Fork control would do now: lift with the forks fully and squarely in, lower over the target, open the side
 * view standing at an upper tier's face, else nothing.
 */
export function fork_action(state: GameState): ForkAction | null {
  if (state.status !== Status.DRIVING || state.side || Math.abs(state.car.speed) >= STANDING) return null;
  const load = state.loads[state.current];
  const task = state.floor.tasks[state.current];
  if (!load || !task) return null;
  if (load.carried) {
    if (task.to.tier > 0) return at_drop_face(state.car, load.carried, task.to) ? ForkAction.RACK : null;
    return placed_in(load_pose(state.car, load.carried), task.to) ? ForkAction.LOWER : null;
  }
  if (load.tier > 0) return at_pick_face(fork_fit(state.car, load.pose)) ? ForkAction.RACK : null;
  return can_lift(fork_fit(state.car, load.pose)) ? ForkAction.LIFT : null;
}

/** The pallet in hand onto the forks, at the offset it sits at; `miss` is the height the forks went in at, off the ideal. */
export function lift_load(state: GameState, miss = 0): GameState {
  const at = state.current;
  const loads = state.loads.map((each, i) => (i === at ? { ...each, carried: offset_of(state.car, each.pose), miss } : each));
  return { ...state, loads, car: { ...state.car, speed: 0 } };
}

/** The pallet on the forks put down where it is, judged against its target; the job is done after the last. */
export function lower_load(state: GameState, miss = 0): GameState {
  const at = state.current;
  const load = state.loads[at];
  const task = state.floor.tasks[at];
  const pose = load_pose(state.car, load.carried!);
  const loads = state.loads.map((each, i) => (i === at ? { pose, tier: task.to.tier, miss: each.miss, carried: null, placed: true } : each));
  const drops = [...state.drops, drop_fit(pose, task.to, [load.miss, miss])];
  const current = at + 1;
  const done = current >= state.floor.tasks.length;
  return { ...state, loads, drops, current, car: { ...state.car, speed: 0 }, status: done ? Status.DONE : state.status };
}

/** Lift or lower on the floor; the side view opens through `open_side` (`rack.ts`). */
export function use_fork(state: GameState): GameState {
  const action = fork_action(state);
  if (action === ForkAction.LIFT) return lift_load(state);
  if (action === ForkAction.LOWER) return lower_load(state);
  return state;
}

// How far off a pallet the forks may stand for the hint to say how to line up.
const LINE_UP_ANGLE = (25 * Math.PI) / 180;
const LINE_UP_SIDE = 0.5;

/** Why the Fork control is off, once the forklift stands at the pallet or carries one near its target. */
export function fork_hint(state: GameState): string | null {
  if (state.status !== Status.DRIVING || state.side || Math.abs(state.car.speed) >= STANDING) return null;
  const load = state.loads[state.current];
  const task = state.floor.tasks[state.current];
  if (!load || !task) return null;
  if (load.carried) {
    const pose = load_pose(state.car, load.carried);
    const upper = task.to.tier > 0;
    if (Math.hypot(pose.x - task.to.home.x, pose.y - task.to.home.y) > (upper ? 2.2 + STANDOFF : 2.2)) return null;
    const off = angle_between(pose.heading, task.to.heading);
    if (off > MAX_ANGLE) return `Not straight: ${degrees(off)}° off`;
    if (!upper) return placed_in(pose, task.to) ? null : `Not inside ${task.to.name} yet`;
    if (at_drop_face(state.car, load.carried, task.to)) return null;
    const depth = depth_to(pose, task.to);
    if (depth < PALLET.length) return `Back out to the rack face: it goes up on ↑${task.to.tier}`;
    if (depth > PALLET.length + STANDOFF) return `Stop at the rack face: it goes up on ↑${task.to.tier}`;
    return `Not lined up with ${task.to.name}`;
  }
  const at = fork_fit(state.car, load.pose);
  if (load.tier > 0) {
    if (at.gap > PALLET.length + STANDOFF + 0.6) return null;
    if (in_pockets(at)) {
      if (at.gap < PALLET.length) return `Back out to the rack face: it's up on ↑${load.tier}`;
      return at.gap > PALLET.length + STANDOFF ? `Stop at the rack face: it's up on ↑${load.tier}` : null;
    }
  } else if (at.gap > PALLET.length + 0.6) return null;
  else if (in_pockets(at)) return at.gap > FULL_GAP ? "Drive the forks fully in" : null;
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
  if (!load || load.carried || load.tier > 0 || state.status !== Status.DRIVING) return null;
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

/** One for the job done, one for the moves at or under par, one for the time (bumps included) at or under the planner's par time. */
export function stars(state: Pick<GameState, "moves" | "ms" | "status" | "round">, par_ms: number | null): 0 | 1 | 2 | 3 {
  if (state.status !== Status.DONE) return 0;
  const moves = state.moves <= par_moves(state.round.size) ? 1 : 0;
  const quick = par_ms !== null && state.ms <= par_ms ? 1 : 0;
  return (1 + moves + quick) as 1 | 2 | 3;
}

export function average_precision(drops: readonly Pick<Precision, "score">[]): number | null {
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
export const data_schema = z.object({ bests: bests_schema, levels: levels_schema });
export type ForkliftData = z.infer<typeof data_schema>;
export const EMPTY_DATA: ForkliftData = { bests: {}, levels: {} };

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

export function round_title(round: Round): string {
  const pallets = `${round.size} ${round.size === 1 ? "pallet" : "pallets"}`;
  if (round.daily) return `Daily job · ${pallets}`;
  if (round.level !== undefined) return `Level ${round.level} · ${pallets}`;
  return `Job · ${pallets}`;
}

/** "Pallet 2/3 → B4 ↑2", or the pick-up while the forks are empty. */
export function task_line(state: GameState): string | null {
  const task = state.floor.tasks[state.current];
  const load = state.loads[state.current];
  if (!task || !load) return null;
  const count = `Pallet ${state.current + 1}/${state.floor.tasks.length}`;
  return load.carried ? `${count} → ${slot_label(task.to)}` : `${count} · pick up at ${slot_label(task.from)}`;
}
