import { inside_convex, overlaps } from "$kit/games/play2d/collision";
import { angle_between, bounds_of, bounds_overlap, centroid, type Bounds, type Polygon, type Vec } from "$kit/games/play2d/geometry";
import { fit, MAX_ANGLE, PERFECT, type Precision } from "$kit/games/play2d/precision";
import { STANDING } from "../../core/keys";
import { collide_shape, obstacles, type Obstacles } from "../../core/obstacles";
import { inflate } from "../../core/planner";
import { SolidKind } from "../../core/scene";
import {
  bodies,
  couple,
  coupler,
  create_car,
  drop,
  Gear,
  headings,
  jackknife,
  LANDING_LEGS,
  shift,
  SHUNTER,
  standing_rig,
  step,
  to_world,
  trailer_corners,
  trailer_pose,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
  type Unhooked,
  without_creep,
} from "../../core/vehicle";
import { build_yard, unit_name, type Target, type Yard } from "./freight";
import { round_size, type Round } from "./levels";

export { PERFECT };

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const SPEC: VehicleSpec = SHUNTER;
/** The cab and engine stand tall from here forward of the drive axle; the chassis behind it fits under a trailer's front. */
export const CAB_FROM = 2.25;
export const BUMP_CLEAR = 0.3;
export const BUMP_FLASH_MS = 1200;
export const BUMP_COST_MS = 5000;

export const TRAILER = "trailer";
export const JACKKNIFE = "jackknife";
export type HitKind = SolidKind | typeof TRAILER | typeof JACKKNIFE;

export interface Contact {
  kind: HitKind;
  at: Vec;
}

export interface Bump {
  kind: HitKind;
  from: Vec;
}

export interface GameState {
  round: Round;
  yard: Yard;
  car: Car;
  /** The shunter with whatever it has coupled. */
  spec: VehicleSpec;
  status: Status;
  moves: number;
  last_drive: Gear | null;
  ms: number;
  contact: Vec | null;
  /** Where each of the yard's units stands; null while it is coupled. */
  stands: (Unhooked | null)[];
  coupled: number | null;
  /** The task in hand: every one before it is done. */
  current: number;
  drops: Precision[];
  bumped: Bump | null;
  bumps: number;
  bump_ms: number;
  /** `bumps` at the last couple or drop (0 at the start): a couple with none since came in clean. */
  bumps_at_hitch: number;
}

export function yard_for(round: Round): Yard {
  return build_yard(round.seed, round.difficulty, round.order);
}

export function create_game(round: Round): GameState {
  const yard = yard_for(round);
  return {
    round,
    yard,
    car: create_car(yard.start, Gear.PARK, SPEC),
    spec: SPEC,
    status: Status.READY,
    moves: 0,
    last_drive: null,
    ms: 0,
    contact: null,
    stands: yard.units.map((unit) => unit.stand),
    coupled: null,
    current: 0,
    drops: [],
    bumped: null,
    bumps: 0,
    bump_ms: 0,
    bumps_at_hitch: 0,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

const near_cache = new WeakMap<Yard, Obstacles>();

export function near_of(yard: Yard): Obstacles {
  let found = near_cache.get(yard);
  if (!found) near_cache.set(yard, (found = obstacles(yard)));
  return found;
}

/** A standing chain's boxes, and for a semi at its front the part behind the landing legs, which a shunter's chassis can't pass. */
export interface StandingShapes {
  boxes: Polygon[];
  legs: Polygon | null;
  bounds: Bounds[];
  extent: Bounds;
}

const standing_cache = new WeakMap<Unhooked, StandingShapes>();

export function standing_shapes(stand: Unhooked): StandingShapes {
  let found = standing_cache.get(stand);
  if (!found) {
    const rig = standing_rig(stand);
    const boxes = stand.links.map((_, i) => trailer_corners(rig.car, rig.spec, i));
    const first = stand.links[0];
    let legs: Polygon | null = null;
    if (first.drawbar < 0) {
      const pose = trailer_pose(rig.car, rig.spec, 0);
      const front = first.axle - LANDING_LEGS;
      const rear = first.axle - first.drawbar - first.box_length;
      const half = first.width / 2;
      legs = [
        { x: front, y: -half },
        { x: front, y: half },
        { x: rear, y: half },
        { x: rear, y: -half },
      ].map((point) => to_world(pose, point));
    }
    standing_cache.set(stand, (found = { boxes, legs, bounds: boxes.map((box) => bounds_of(box)), extent: bounds_of(boxes.flat()) }));
  }
  return found;
}

const grown_specs = new WeakMap<VehicleSpec, Map<number, VehicleSpec>>();

function grown_spec(spec: VehicleSpec, margin: number): VehicleSpec {
  let sizes = grown_specs.get(spec);
  if (!sizes) grown_specs.set(spec, (sizes = new Map()));
  let found = sizes.get(margin);
  if (!found) sizes.set(margin, (found = inflate(spec, margin)));
  return found;
}

/** The shunter's tall front, for what a trailer's raised front hits; its whole body is `bodies()[0]`. */
export function cab_shape(car: Placement, spec: VehicleSpec): Polygon {
  const front = spec.length - spec.rear_overhang;
  const half = spec.width / 2;
  return [
    { x: front, y: -half },
    { x: front, y: half },
    { x: CAB_FROM, y: half },
    { x: CAB_FROM, y: -half },
  ].map((point) => to_world(car, point));
}

function midpoint(a: Polygon, b: Polygon): Vec {
  const p = centroid(a);
  const q = centroid(b);
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

/**
 * The rig against the yard and every standing chain. The shunter's chassis slides under a standing semi's front, so
 * there it only meets the box behind the landing legs, while its cab meets the whole box; every towed link meets
 * every box. A hinge past its limit is a contact too. `margin` grows every body, for the planner.
 */
export function contact(yard: Yard, stands: readonly (Unhooked | null)[], car: Placement, spec: VehicleSpec, margin = 0): Contact | null {
  const grown = margin > 0 ? grown_spec(spec, margin) : spec;
  const hinge = jackknife(car, spec);
  if (hinge >= 0) return { kind: JACKKNIFE, at: to_world(trailer_pose(car, spec, hinge), { x: spec.hitches[hinge].axle, y: 0 }) };
  const shapes = bodies(car, grown);
  const near = near_of(yard);
  for (const shape of shapes) {
    const hit = collide_shape(shape, near);
    if (hit) return { kind: hit.solid.kind, at: hit.at };
  }
  const [body, ...links] = shapes;
  const cab = cab_shape(car, grown);
  const reach = bounds_of(shapes.flat());
  const body_box = bounds_of(body);
  const link_boxes = links.map((link) => bounds_of(link));
  for (const stand of stands) {
    if (!stand) continue;
    const { boxes, legs, bounds, extent } = standing_shapes(stand);
    if (!bounds_overlap(reach, extent)) continue;
    for (let i = 0; i < boxes.length; i++) {
      const box = boxes[i];
      if (!bounds_overlap(reach, bounds[i])) continue;
      const low = i === 0 && legs ? legs : box;
      if (bounds_overlap(body_box, bounds[i])) {
        if (overlaps(body, low)) return { kind: TRAILER, at: midpoint(body, low) };
        if (low !== box && overlaps(cab, box)) return { kind: TRAILER, at: midpoint(cab, box) };
      }
      for (let k = 0; k < links.length; k++) {
        if (bounds_overlap(link_boxes[k], bounds[i]) && overlaps(links[k], box)) return { kind: TRAILER, at: midpoint(links[k], box) };
      }
    }
  }
  return null;
}

/** What Show hitboxes outlines: the rig's bodies and every standing chain's boxes. */
export function hitbox_shapes(state: Pick<GameState, "car" | "spec" | "stands">): Polygon[] {
  return [...bodies(state.car, state.spec), cab_shape(state.car, state.spec), ...state.stands.flatMap((stand) => (stand ? standing_shapes(stand).boxes : []))];
}

/** Couples the task's chain when the shunter backs its coupler onto it; nothing else latches. */
function latch(state: GameState, car: Car): GameState | null {
  if (state.coupled !== null || car.speed > 0) return null;
  const task = state.yard.tasks[state.current];
  const stand = task ? state.stands[task.unit] : null;
  if (!task || !stand) return null;
  const coupled = couple(car, state.spec, stand);
  if (!coupled) return null;
  const stands = state.stands.map((each, i) => (i === task.unit ? null : each));
  return { ...state, car: { ...coupled.car, speed: 0 }, spec: coupled.spec, stands, coupled: task.unit, bumps_at_hitch: state.bumps };
}

/** `creep` is the Creep setting: without it the shunter moves only on the gas. */
export function advance(state: GameState, input: Input, dt: number, creep = true): GameState {
  if (state.status !== Status.DRIVING) return state;
  const spec = creep ? state.spec : without_creep(state.spec);
  const stepped = { ...step(state.car, input, dt, spec) };
  const ms = state.ms + dt * 1000;
  const latched = latch(state, stepped);
  if (latched) return { ...latched, ms };
  const hit = contact(state.yard, state.stands, stepped, state.spec);
  if (hit) return bump(state, ms, hit);
  const bumped = state.bumped && Math.hypot(stepped.x - state.bumped.from.x, stepped.y - state.bumped.from.y) <= BUMP_CLEAR ? state.bumped : null;
  return { ...state, car: stepped, ms, bumped };
}

/**
 * Nothing ends a round: a contact is a bump. The step is undone, the rig stops where it was, and the first bump
 * against something costs `BUMP_COST_MS`; pressing on is the same bump.
 */
export function bump(state: GameState, ms: number, hit: Contact): GameState {
  const car = { ...state.car, speed: 0 };
  if (state.bumped) return { ...state, car, ms, contact: hit.at };
  const cost = ms + BUMP_COST_MS;
  return { ...state, car, ms: cost, contact: hit.at, bumped: { kind: hit.kind, from: { x: car.x, y: car.y } }, bumps: state.bumps + 1, bump_ms: cost };
}

export function bump_flash(state: Pick<GameState, "bumps" | "bump_ms" | "ms" | "contact">): boolean {
  return state.bumps > 0 && state.contact !== null && state.ms - state.bump_ms < BUMP_FLASH_MS;
}

const HIT_NAMES: Record<HitKind, string> = {
  car: "a truck",
  wall: "the wall",
  pillar: "a pillar",
  kerb: "the kerb",
  shelf: "a shelf",
  water: "the water",
  post: "a dock bumper",
  rack: "a rack",
  pallet: "a pallet",
  hedge: "a hedge",
  trailer: "a trailer",
  jackknife: "",
};

export function bump_hint(state: Pick<GameState, "bumped" | "status">): string | null {
  const hit = state.bumped;
  if (!hit || state.status !== Status.DRIVING) return null;
  if (hit.kind === JACKKNIFE) return "Jackknifed: drive the other way to straighten out";
  return `Bumped ${HIT_NAMES[hit.kind]}: back off`;
}

export function change_gear(state: GameState, gear: Gear): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, state.spec);
  if (car === state.car) return state;
  const drives = gear === Gear.DRIVE || gear === Gear.REVERSE;
  const moves = drives && state.last_drive !== null && state.last_drive !== gear ? state.moves + 1 : state.moves;
  return { ...state, car, moves, last_drive: drives ? gear : state.last_drive };
}

/** Every link's box inside the target and straight in it. */
export function placed_in(car: Placement, spec: VehicleSpec, target: Target): boolean {
  if (spec.hitches.length === 0) return false;
  const links = bodies(car, spec).slice(1);
  const turned = headings(car, spec).slice(1);
  return turned.every((heading) => angle_between(heading, target.heading) <= MAX_ANGLE) && links.every((box) => box.every((p) => inside_convex(p, target.shape)));
}

export function drop_fit(car: Placement, spec: VehicleSpec, target: Target): Precision {
  return fit(bodies(car, spec).slice(1).flat(), headings(car, spec).slice(1), { shape: target.shape, heading: target.heading, either: false });
}

/** The Drop control is live standing still with the task's chain inside its target. */
export function can_drop(state: GameState): boolean {
  if (state.status !== Status.DRIVING || state.coupled === null || Math.abs(state.car.speed) >= STANDING) return false;
  const task = state.yard.tasks[state.current];
  return !!task && placed_in(state.car, state.spec, task.to);
}

export function drop_unit(state: GameState): GameState {
  if (!can_drop(state)) return state;
  const task = state.yard.tasks[state.current];
  const dropped = drop(state.car, state.spec)!;
  const stands = state.stands.map((each, i) => (i === task.unit ? dropped.unit : each));
  const drops = [...state.drops, drop_fit(state.car, state.spec, task.to)];
  const current = state.current + 1;
  const done = current >= state.yard.tasks.length;
  return {
    ...state,
    car: { ...dropped.car, speed: 0 },
    spec: dropped.spec,
    stands,
    coupled: null,
    drops,
    bumps_at_hitch: state.bumps,
    current,
    status: done ? Status.DONE : state.status,
  };
}

function degrees(radians: number): string {
  return ((radians * 180) / Math.PI).toFixed(1);
}

const LINE_UP_REACH = 4;

/** How to get under the chain in hand, or into its target with it: the line the hint shows. */
export function drive_hint(state: GameState): string | null {
  if (state.status !== Status.DRIVING || Math.abs(state.car.speed) >= STANDING) return null;
  const task = state.yard.tasks[state.current];
  if (!task) return null;
  if (state.coupled === null) {
    const stand = state.stands[task.unit];
    if (!stand) return null;
    const at = coupler(state.car, state.spec, stand.links[0]);
    const gap = Math.hypot(at.x - stand.hinge.x, at.y - stand.hinge.y);
    if (gap > LINE_UP_REACH) return null;
    const heading = stand.trailers[0].heading;
    const off = angle_between(state.car.heading, heading);
    if (off > Math.PI / 2) return "Turn round: back under it";
    const side = -(stand.hinge.x - at.x) * Math.sin(heading) + (stand.hinge.y - at.y) * Math.cos(heading);
    if (off > (10 * Math.PI) / 180) return `Not square: ${degrees(off)}° off`;
    if (Math.abs(side) > 0.08) return `Line up: kingpin ${Math.round(Math.abs(side) * 100)} cm to the ${side > 0 ? "left" : "right"}`;
    return "Back straight under it";
  }
  const centre = centroid(task.to.shape);
  const first = trailer_pose(state.car, state.spec, 0);
  if (Math.hypot(first.x - centre.x, first.y - centre.y) > 16) return null;
  const off = Math.max(...headings(state.car, state.spec).slice(1).map((heading) => angle_between(heading, task.to.heading)));
  if (off > MAX_ANGLE) return `Not straight: ${degrees(off)}° off`;
  return placed_in(state.car, state.spec, task.to) ? null : `Not inside ${task.to.name} yet`;
}

/** Where the player should head: under the chain in hand, then its target. */
export function objective(state: GameState): Target | null {
  const task = state.yard.tasks[state.current];
  if (!task) return null;
  return state.coupled === null ? task.from : task.to;
}

/** "Trailer 214 → Door 3", or the pick-up while nothing is coupled. */
export function task_line(state: GameState): string | null {
  const task = state.yard.tasks[state.current];
  if (!task) return null;
  const unit = state.yard.units[task.unit];
  const count = `${state.current + 1}/${state.yard.tasks.length}`;
  return state.coupled === null ? `${count} · couple ${unit_name(unit)} in ${task.from.name}` : `${count} · ${unit_name(unit)} → ${task.to.name}`;
}

export interface Par {
  ms: number;
}

/**
 * Backing a trailer in takes four drives (under it, out with it, back in, away) and one more to line up; pulling one
 * through takes two and one more. The last task needs no driving away.
 */
export function par_moves(round: Pick<Round, "order">): number {
  const { semis, dollies, doubles } = round.order;
  return semis * 5 + (dollies + doubles) * 3 - 1;
}

export function stars(state: Pick<GameState, "moves" | "ms" | "status" | "round">, par_ms: number | null): 0 | 1 | 2 | 3 {
  if (state.status !== Status.DONE) return 0;
  const moves = state.moves <= par_moves(state.round) ? 1 : 0;
  const quick = par_ms !== null && state.ms <= par_ms ? 1 : 0;
  return (1 + moves + quick) as 1 | 2 | 3;
}

export function average_precision(drops: readonly Pick<Precision, "score">[]): number | null {
  if (drops.length === 0) return null;
  return drops.reduce((sum, each) => sum + each.score, 0) / drops.length;
}

export function round_title(round: Round): string {
  const size = round_size(round);
  const count = `${size} ${size === 1 ? "drop" : "drops"}`;
  if (round.daily) return `Daily job · ${count}`;
  if (round.level !== undefined) return `Level ${round.level} · ${count}`;
  return `Job · ${count}`;
}
