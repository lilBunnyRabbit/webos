import { z } from "zod";
import { inside_convex, overlaps } from "../../core/collision";
import { bounds_of, bounds_overlap, rect, type Bounds, type Polygon, type Pose, type Vec } from "../../core/geometry";
import { STANDING } from "../../core/keys";
import { collide, obstacles, type Obstacles } from "../../core/obstacles";
import { SolidKind } from "../../core/scene";
import { hash } from "../../core/seed";
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
import { build_course, CONE, StepKind, type Course, type Gate, type Step } from "./course";

export const Status = {
  READY: "ready",
  DRIVING: "driving",
  PAUSED: "paused",
  DONE: "done",
  CRASHED: "crashed",
} as const;
export type Status = (typeof Status)[keyof typeof Status];

export const PENALTY_MS = 5000;
export const COURSE_COUNT = 12;

export interface Round {
  vehicle: Vehicle;
  /** 1 to `COURSE_COUNT`; the daily has its own seed instead. */
  course: number | null;
  seed: number;
  daily?: string;
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

export const DAILY_VEHICLES: readonly Vehicle[] = GARAGE.flatMap((shelf) => shelf.vehicles).filter((each) => !experimental(each));

export function daily_round(day: string, seed: number): Round {
  return { vehicle: DAILY_VEHICLES[hash(seed, 3) % DAILY_VEHICLES.length], course: null, seed, daily: day };
}

export function create_game(round: Round): GameState {
  const spec = spec_of(round);
  const course = build_course(round.seed, spec);
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

/**
 * Whether a move from `was` to `now` finishes the step: crossing a gate the right way (backing up for the reverse
 * gate), or standing in the stop box with the whole rig inside it.
 */
export function step_done(step: Step, was: Placement, now: Placement, speed: number, spec: VehicleSpec): boolean {
  if (step.kind === StepKind.STOP) return Math.abs(speed) < STANDING && in_box(now, step.box!, spec);
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

export const result_schema = z.object({
  ms: z.number().nonnegative(),
  cones: z.number().int().nonnegative(),
  /** On a daily's best only: its key doesn't name the vehicle. */
  vehicle: vehicle_schema.optional(),
});
export type Result = z.infer<typeof result_schema>;
export const bests_schema = z.record(z.string(), result_schema);
export type Bests = z.infer<typeof bests_schema>;
export const data_schema = z.object({ bests: bests_schema });
export type Data = z.infer<typeof data_schema>;

export function round_key(round: Round): string {
  return round.daily ? `daily:${round.daily}` : `${round.vehicle}:${round.course}`;
}

export interface Recorded {
  bests: Bests;
  improved: boolean;
  first: boolean;
}

export function record_best(bests: Bests, round: Round, result: Result): Recorded {
  const key = round_key(round);
  const old = bests[key];
  const improved = !old || result.ms < old.ms;
  const run = round.daily ? { ...result, vehicle: round.vehicle } : result;
  return { bests: improved ? { ...bests, [key]: run } : bests, improved, first: !old };
}

/** Garage shelves with a run by one of their vehicles, dailies included; the experimental chains don't count. */
export function shelves_done(bests: Bests): number {
  const vehicles = new Set<string>();
  for (const [key, best] of Object.entries(bests)) vehicles.add(key.startsWith("daily:") ? (best.vehicle ?? "") : key.split(":")[0]);
  return GARAGE.filter((shelf) => shelf.vehicles.some((each) => !experimental(each) && vehicles.has(each))).length;
}

export function round_title(round: Round): string {
  return round.daily ? "Daily rodeo" : `Course ${round.course}`;
}
