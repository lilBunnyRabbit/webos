import { z } from "zod";
import { inside_convex, overlaps } from "$kit/games/play2d/collision";
import { angle_between, bounds_of, bounds_overlap, rect, type Bounds, type Polygon, type Pose, type Vec } from "$kit/games/play2d/geometry";
import { STANDING } from "../../core/keys";
import { collide, obstacles, type Obstacles } from "../../core/obstacles";
import { SolidKind } from "../../core/scene";
import { hash } from "$kit/games/play2d/seed";
import {
  bodies,
  create_car,
  Gear,
  hitch_point,
  jackknife,
  nose,
  set_crab,
  shift,
  step,
  Vehicle,
  VEHICLES,
  type Car,
  type Input,
  type Placement,
  type VehicleSpec,
} from "../../core/vehicle";
import { GARAGE, type Shelf } from "../../hub/yard";
import { better, keep_best, levels_schema, unlocked as open_levels, type LevelStars } from "../../core/track";
import { build_course, CONE, StepKind, type Course, type CourseShape, type Gate, type Step } from "./course";

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
  CRASHED: "crashed",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const Mode = { COURSES: "courses", LEVELS: "levels" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];
export const mode_schema = z.enum([Mode.COURSES, Mode.LEVELS]);

export const PENALTY_MS = 5000;
export const COURSE_COUNT = 12;

export interface Round {
  vehicle: Vehicle;
  /** 1 to `COURSE_COUNT`; a level and the daily have their own seed instead. */
  course: number | null;
  seed: number;
  level?: number;
  daily?: string;
}

export interface Level {
  name: string;
  seed: number;
  vehicle: Vehicle;
  shape: CourseShape;
  /** What the level brings in, on its start card. */
  brings: string;
}

const shape = (gates: number, cones: number, room: number, spacing: number, bay = false): CourseShape => ({ gates, cones, room, spacing, bay });

/** Each level brings in one thing: a vehicle, tighter gates, a longer slalom, the bay's three-point turn, a trailer. */
export const LEVELS: readonly Level[] = [
  { name: "First run", vehicle: Vehicle.HATCH, seed: 101, shape: shape(2, 3, 1.3, 1.15), brings: "Two wide gates and three cones: learn the run." },
  { name: "Full course", vehicle: Vehicle.HATCH, seed: 102, shape: shape(3, 4, 1, 1), brings: "Three gates and four cones, a full course." },
  { name: "Tight gates", vehicle: Vehicle.HATCH, seed: 113, shape: shape(3, 4, 0.7, 1), brings: "Tighter gates, less room either side." },
  { name: "Long slalom", vehicle: Vehicle.HATCH, seed: 104, shape: shape(4, 6, 0.85, 0.85), brings: "A longer slalom, its cones closer together." },
  { name: "Three-point turn", vehicle: Vehicle.HATCH, seed: 105, shape: shape(3, 4, 1, 1, true), brings: "A bay at the far end too narrow to U-turn in: turn round in three." },
  { name: "Van", vehicle: Vehicle.VAN, seed: 106, shape: shape(3, 5, 0.9, 1), brings: "A van: longer, wider, a bigger circle." },
  { name: "Van in the bay", vehicle: Vehicle.VAN, seed: 107, shape: shape(4, 5, 0.8, 0.9, true), brings: "The van's three-point turn, through tighter gates." },
  { name: "Bus", vehicle: Vehicle.BUS, seed: 108, shape: shape(3, 4, 1, 1), brings: "A bus: its long wheelbase cuts every corner." },
  { name: "Trailer", vehicle: Vehicle.TOWING, seed: 109, shape: shape(3, 4, 1, 1), brings: "A trailer: it follows wide, and backs out the other way." },
  { name: "Trailer slalom", vehicle: Vehicle.TOWING, seed: 110, shape: shape(4, 5, 0.85, 0.9), brings: "The trailer through tighter gates and more cones." },
  { name: "Bus in the bay", vehicle: Vehicle.BUS, seed: 111, shape: shape(4, 5, 0.85, 0.9, true), brings: "A three-point turn in a bus." },
  { name: "Final", vehicle: Vehicle.PICKUP, seed: 112, shape: shape(5, 7, 0.7, 0.85, true), brings: "Everything at once, all of it tight, in a pickup." },
];
export const LEVEL_COUNT = LEVELS.length;

export function level_round(level: number): Round {
  const at = Math.max(1, Math.min(LEVEL_COUNT, Math.round(level)));
  return { vehicle: LEVELS[at - 1].vehicle, course: null, seed: LEVELS[at - 1].seed, level: at };
}

export function level_of(round: Round): Level | null {
  return round.level === undefined ? null : LEVELS[round.level - 1];
}

export interface Cone {
  at: Vec;
  down: Pose | null;
}

export const Crash = { WALL: "wall", JACKKNIFE: "jackknife" } as const;
export type Crash = (typeof Crash)[keyof typeof Crash];

export interface GameState {
  round: Round;
  course: Course;
  car: Car;
  status: Status;
  ms: number;
  cones: Cone[];
  current: number;
  contact: Vec | null;
  crash: Crash | null;
}

export function spec_of(round: Round): VehicleSpec {
  return VEHICLES[round.vehicle];
}

export function course_seed(course: number): number {
  return hash(0x40de0, course);
}

export function course_round(vehicle: Vehicle, course: number): Round {
  const at = Math.max(1, Math.min(COURSE_COUNT, Math.round(course)));
  return { vehicle, course: at, seed: course_seed(at) };
}

export const vehicle_schema = z.enum(Object.values(Vehicle) as [Vehicle, ...Vehicle[]]);

/** A chain of two or more links: no course is proven for one, so it's offered apart, with no daily and no achievements. */
export function experimental(vehicle: Vehicle): boolean {
  return VEHICLES[vehicle].hitches.length > 1;
}

/** The garage's shelves without the chains, then the chains on a shelf of their own. */
export const SHELVES: readonly Shelf[] = [
  ...GARAGE.map((shelf) => ({ ...shelf, vehicles: shelf.vehicles.filter((each) => !experimental(each)) })).filter((shelf) => shelf.vehicles.length > 0),
  { id: "experimental", name: "Experimental", vehicles: GARAGE.flatMap((shelf) => shelf.vehicles).filter(experimental) },
];

export function rodeo_shelf(vehicle: Vehicle): Shelf {
  return SHELVES.find((shelf) => shelf.vehicles.includes(vehicle)) ?? SHELVES[0];
}

// Pinned rather than read from the garage, so a new vehicle doesn't change which one a past day drew: add new ones at
// the end, never reorder.
export const DAILY_VEHICLES: readonly Vehicle[] = [
  Vehicle.HATCH, Vehicle.CITY, Vehicle.SUV, Vehicle.GT, Vehicle.LIMO, Vehicle.VAN, Vehicle.PICKUP, Vehicle.CAMPER,
  Vehicle.TAXI, Vehicle.POLICE, Vehicle.AMBULANCE, Vehicle.FIRE, Vehicle.LADDER, Vehicle.GARBAGE, Vehicle.BAGGAGE,
  Vehicle.BUS, Vehicle.DECKER, Vehicle.COACH, Vehicle.ARTIC,
  Vehicle.BOX_TRUCK, Vehicle.SEMI, Vehicle.DRAWBAR, Vehicle.ROAD_TRAIN,
  Vehicle.TOWING, Vehicle.CARAVAN, Vehicle.BOAT, Vehicle.HORSE_BOX, Vehicle.TRACTOR, Vehicle.TRACTOR_TWO, Vehicle.QUAD,
  Vehicle.FORKLIFT, Vehicle.BOBCAT, Vehicle.TELEHANDLER, Vehicle.LOADER, Vehicle.DUMPER, Vehicle.MOWER, Vehicle.TANK,
  Vehicle.MOTORCYCLE, Vehicle.TUK_TUK, Vehicle.GOLF_CART, Vehicle.RESURFACER, Vehicle.TROLLEY, Vehicle.F1,
].filter((each) => !experimental(each));

export function daily_round(day: string, seed: number): Round {
  return { vehicle: DAILY_VEHICLES[hash(seed, 3) % DAILY_VEHICLES.length], course: null, seed, daily: day };
}

export function create_game(round: Round): GameState {
  const spec = spec_of(round);
  const course = build_course(round.seed, spec, level_of(round)?.shape);
  return {
    round,
    course,
    car: create_car(course.start, Gear.PARK, spec),
    status: Status.READY,
    ms: 0,
    cones: course.cones.map((at) => ({ at, down: null })),
    current: 0,
    contact: null,
    crash: null,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return state.status === status ? state : { ...state, status };
}

export function knocked(state: Pick<GameState, "cones">): number {
  return state.cones.reduce((sum, cone) => sum + (cone.down ? 1 : 0), 0);
}

export function total_ms(state: Pick<GameState, "cones" | "ms">): number {
  return state.ms + knocked(state) * PENALTY_MS;
}

export function cone_shape(at: Vec): Polygon {
  return rect(at.x - CONE / 2, at.y - CONE / 2, at.x + CONE / 2, at.y + CONE / 2);
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

export function crossed(gate: Gate, p: Vec, q: Vec): boolean {
  const mx = q.x - p.x;
  const my = q.y - p.y;
  if (mx * gate.normal.x + my * gate.normal.y <= 0) return false;
  const gx = gate.b.x - gate.a.x;
  const gy = gate.b.y - gate.a.y;
  const denom = cross(mx, my, gx, gy);
  if (Math.abs(denom) < 1e-12) return false;
  const t = cross(gate.a.x - p.x, gate.a.y - p.y, gx, gy) / denom;
  const u = cross(gate.a.x - p.x, gate.a.y - p.y, mx, my) / denom;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

export function in_box(car: Placement, box: Polygon, spec: VehicleSpec): boolean {
  return bodies(car, spec).every((body) => body.every((corner) => inside_convex(corner, box)));
}

/** Facing back down the course within this, the whole rig in the bay, a three-point turn is done. */
export const TURNED = 0.35;

/**
 * Whether a move from `was` to `now` finishes the step: crossing a gate the right way (backing up for the reverse
 * gate), standing in the stop box with the whole rig inside it, or turned round inside the bay.
 */
export function step_done(step: Step, was: Placement, now: Placement, speed: number, spec: VehicleSpec): boolean {
  if (step.kind === StepKind.STOP) return Math.abs(speed) < STANDING && in_box(now, step.box!, spec);
  if (step.kind === StepKind.TURN) return angle_between(now.heading, Math.PI) < TURNED && in_box(now, step.box!, spec);
  if (step.kind === StepKind.REVERSE && speed >= 0) return false;
  return crossed(step.gate!, nose(was, spec), nose(now, spec));
}

const cone_bounds = new WeakMap<Vec, Bounds>();

function bounds_of_cone(at: Vec): Bounds {
  let found = cone_bounds.get(at);
  if (!found) cone_bounds.set(at, (found = bounds_of(cone_shape(at))));
  return found;
}

export function touched(cones: readonly Cone[], car: Placement, spec: VehicleSpec): number[] {
  const shapes = bodies(car, spec);
  const boxes = shapes.map((shape) => bounds_of(shape));
  const hits: number[] = [];
  cones.forEach((cone, i) => {
    if (cone.down) return;
    const box = bounds_of_cone(cone.at);
    const shape = cone_shape(cone.at);
    if (shapes.some((body, k) => bounds_overlap(boxes[k], box) && overlaps(body, shape))) hits.push(i);
  });
  return hits;
}

const sensed_cache = new WeakMap<readonly Cone[], Obstacles>();

/** What the parking sensors hear: the fence and every cone still standing. */
export function sensed(state: Pick<GameState, "course" | "cones">): Obstacles {
  let found = sensed_cache.get(state.cones);
  if (!found) {
    const fence = obstacles(state.course);
    const standing = state.cones.filter((cone) => !cone.down);
    found = {
      solids: [...fence.solids, ...standing.map((cone) => ({ kind: SolidKind.POST, shape: cone_shape(cone.at) }))],
      bounds: [...fence.bounds, ...standing.map((cone) => bounds_of_cone(cone.at))],
    };
    sensed_cache.set(state.cones, found);
  }
  return found;
}

// A knocked cone rolls off the way the rig was going, so it lies clear of the vehicle that hit it.
function topple(cone: Vec, car: Placement, was: Placement): Pose {
  const dx = car.x - was.x;
  const dy = car.y - was.y;
  const moved = Math.hypot(dx, dy);
  const heading = moved > 1e-6 ? Math.atan2(dy, dx) : car.heading;
  return { x: cone.x + Math.cos(heading) * 0.35, y: cone.y + Math.sin(heading) * 0.35, heading };
}

export function advance(state: GameState, input: Input, dt: number, spec: VehicleSpec): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = step(state.car, input, dt, spec);
  const ms = state.ms + dt * 1000;
  const folded = jackknife(car, spec);
  if (folded >= 0) {
    return { ...state, car: { ...car, speed: 0 }, ms, status: Status.CRASHED, contact: hitch_point(car, spec, folded), crash: Crash.JACKKNIFE };
  }
  const hit = collide(car, obstacles(state.course), spec);
  if (hit) return { ...state, car: { ...car, speed: 0 }, ms, status: Status.CRASHED, contact: hit.at, crash: Crash.WALL };
  const hits = touched(state.cones, car, spec);
  const cones = hits.length === 0 ? state.cones : state.cones.map((cone, i) => (hits.includes(i) ? { ...cone, down: topple(cone.at, car, state.car) } : cone));
  let current = state.current;
  const next_step = state.course.steps[current];
  if (next_step && step_done(next_step, state.car, car, car.speed, spec)) current++;
  const done = current >= state.course.steps.length;
  return { ...state, car, ms, cones, current, status: done ? Status.DONE : state.status };
}

export function change_gear(state: GameState, gear: Gear, spec: VehicleSpec): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = shift(state.car, gear, spec);
  return car === state.car ? state : { ...state, car };
}

export function toggle_crab(state: GameState, spec: VehicleSpec): GameState {
  if (state.status !== Status.DRIVING) return state;
  const car = set_crab(state.car, !state.car.crab, spec);
  return car === state.car ? state : { ...state, car };
}

export function step_name(step: Step, index: number, steps: readonly Step[]): string {
  if (step.kind === StepKind.GATE) {
    const of = steps.filter((each) => each.kind === StepKind.GATE).length;
    return `Gate ${index + 1}/${of}`;
  }
  if (step.kind === StepKind.SLALOM) {
    const first = steps.findIndex((each) => each.kind === StepKind.SLALOM);
    const of = steps.filter((each) => each.kind === StepKind.SLALOM).length;
    return `Slalom ${index - first + 1}/${of} · pass it on the ${step.side! > 0 ? "right" : "left"}`;
  }
  if (step.kind === StepKind.TURN) return "Turn round in the bay";
  if (step.kind === StepKind.STOP) return "Stop in the box";
  return "Back out through the gate";
}

export function step_line(state: GameState): string | null {
  const step = state.course.steps[state.current];
  return step ? step_name(step, state.current, state.course.steps) : null;
}

export function step_target(step: Step): Polygon {
  if (step.box) return step.box;
  const { a, b } = step.gate!;
  if (step.kind === StepKind.SLALOM) return cone_shape(a);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return cone_shape(mid);
}

export function crash_title(crash: Crash | null): string {
  return crash === Crash.JACKKNIFE ? "Jackknifed" : "Hit the fence";
}

export interface Par {
  ms: number;
}

/** One for the course done, one for no cone down, one for the time (cones included) at or under the planner's par. */
export function stars(state: Pick<GameState, "status" | "cones" | "ms">, par_ms: number | null): 0 | 1 | 2 | 3 {
  if (state.status !== Status.DONE) return 0;
  const clean = knocked(state) === 0 ? 1 : 0;
  const quick = par_ms !== null && total_ms(state) <= par_ms ? 1 : 0;
  return (1 + clean + quick) as 1 | 2 | 3;
}

export const result_schema = z.object({
  ms: z.number().nonnegative(),
  cones: z.number().int().nonnegative(),
  /** On a level's best only. */
  stars: z.number().int().min(1).max(3).optional(),
  /** On a daily's and a level's best: their keys don't name the vehicle. */
  vehicle: vehicle_schema.optional(),
});
export type Result = z.infer<typeof result_schema>;
export const bests_schema = z.record(z.string(), result_schema);
export type Bests = z.infer<typeof bests_schema>;
// Saves from before the levels have no `levels`.
export const data_schema = z.object({ bests: bests_schema, levels: levels_schema.default({}) });
export type Data = z.infer<typeof data_schema>;
export const EMPTY_DATA: Data = { bests: {}, levels: {} };

export function round_key(round: Round): string {
  if (round.daily) return `daily:${round.daily}`;
  if (round.level !== undefined) return `level:${round.level}`;
  return `${round.vehicle}:${round.course}`;
}

export interface Recorded {
  bests: Bests;
  improved: boolean;
  first: boolean;
}

const quicker = (a: Result | undefined, b: Result) => !a || b.ms < a.ms;
const starrier = (a: Result | undefined, b: Result) => better(a && { stars: a.stars ?? 0, ms: a.ms }, { stars: b.stars ?? 0, ms: b.ms });

/** A free course or the daily keeps its quickest run; a level its most stars, then its quickest. */
export function record_best(bests: Bests, round: Round, result: Result): Recorded {
  const run = round.daily || round.level !== undefined ? { ...result, vehicle: round.vehicle } : result;
  return keep_best(bests, round_key(round), run, round.level !== undefined ? starrier : quicker);
}

export function unlocked(levels: LevelStars): number {
  return open_levels(levels, LEVEL_COUNT);
}

/** Garage shelves with a run by one of their vehicles, dailies and levels included; the experimental chains don't count. */
export function shelves_done(bests: Bests): number {
  const vehicles = new Set<string>();
  for (const [key, best] of Object.entries(bests)) vehicles.add(best.vehicle ?? key.split(":")[0]);
  return GARAGE.filter((shelf) => shelf.vehicles.some((each) => !experimental(each) && vehicles.has(each))).length;
}

export function round_title(round: Round): string {
  if (round.daily) return "Daily rodeo";
  if (round.level !== undefined) return `Level ${round.level}`;
  return `Course ${round.course}`;
}
