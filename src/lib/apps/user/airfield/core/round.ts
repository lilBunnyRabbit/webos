import { course_env, ground_at, hazards, local, on_strip, type Course, type Strip } from "./course";
import { advance, create_flight, Grade, Status, wheel_height, type Flight } from "./flight";
import { airborne, alpha_for, create_plane, elevator_for, G, ground_speed, RHO, spool_for, type Coefficients, type Env, type Input, type Plane } from "./plane";

export const Goal = { LAND: "land", TAKEOFF: "takeoff" } as const;
export type Goal = (typeof Goal)[keyof typeof Goal];

export interface Start {
  x: number;
  /** Metres above the ground; 0 starts at rest on the strip. */
  agl: number;
  speed: number;
  flap_notch: number;
  lever_notch: number;
}

export interface Scene {
  course: Course;
  start: Start;
  goal: Goal;
  /** Landing: the strip to stop on. Takeoff: the strip the run starts from. */
  strip: Strip;
  /** Takeoff: pass `x` at least `height` above the ground. */
  clear: { x: number; height: number } | null;
  /** The glidepath the autopilot flies to the strip, degrees. */
  slope: number;
  /** The engines' share of their thrust: 0 deadstick, 0.5 one engine out. */
  power: number;
  /** Metres a landing round must fly off the ground before its landing counts: a circuit can't be won with a hop. */
  min_air: number;
}

/** A stall below this height is a crash in a round (ADR-098, Scoring). */
export const STALL_FLOOR = 20;
/** Stopped this long on the strip and the landing is done. */
export const STOP_HOLD = 1;
const STOP_SPEED = 0.5;

export const Failure = { CRASH: "crash", OFF_STRIP: "off-strip", TAIL_STRIKE: "tail-strike", STALLED: "stalled" } as const;
export type Failure = (typeof Failure)[keyof typeof Failure];

export interface RoundState {
  scene: Scene;
  flight: Flight;
  /** Seconds stopped so far. */
  held: number;
  failure: Failure | null;
}

/** The engines a level leaves you: the coefficients with their thrust cut to the scene's share. */
export function powered(c: Coefficients, scene: Scene): Coefficients {
  return scene.power === 1 ? c : { ...c, thrust: c.thrust * scene.power };
}

/** The plane where the round starts, and the trim that flies it hands off: level at the start speed, flaps set, in the start's wind. */
export function start_plane(scene: Scene, c: Coefficients, flaps: number, throttle: number): { plane: Plane; trim: number } {
  const { start, course } = scene;
  const ground = ground_at(course, start.x);
  if (start.agl <= 0) return { plane: { ...create_plane(c, start.x, 1, ground), flaps }, trim: 0 };
  const V = start.speed;
  const alpha = alpha_for((c.mass * G) / (0.5 * RHO * V * V * c.spec.wing_area), flaps, c);
  const trim = elevator_for(alpha, flaps, c);
  const wind = course_env(course, start.x, start.agl, 0).wind;
  const plane: Plane = {
    ...create_plane(c, start.x, 1, ground),
    h: ground + start.agl,
    vx: V + wind,
    pitch: alpha - (c.spec.incidence * Math.PI) / 180,
    spool: spool_for(throttle, c),
    elevator: trim,
    flaps,
    main_on: false,
    aux_on: false,
  };
  return { plane, trim };
}

export function create_round(scene: Scene, c: Coefficients, flaps: number, throttle: number): RoundState {
  return { scene, flight: create_flight(start_plane(scene, c, flaps, throttle).plane, Status.READY), held: 0, failure: null };
}

export function round_env(scene: Scene, plane: Plane, time: number): Env {
  const agl = plane.h - ground_at(scene.course, plane.x);
  return course_env(scene.course, plane.x, Math.max(0, agl), time);
}

function wheels_on(scene: Scene, strip: Strip, plane: Plane, c: Coefficients): boolean {
  const cos = Math.cos(plane.yaw);
  return [c.spec.gear.main, c.spec.gear.aux].every((p) => on_strip(scene.course, strip, plane.x + p.x * cos));
}

/** One step of a round: the flight in the level's world, then the goal. */
export function step_round(state: RoundState, input: Input, c: Coefficients, dt: number): RoundState {
  if (state.flight.status !== Status.FLYING) return state;
  const { scene } = state;
  const env = round_env(scene, state.flight.plane, state.flight.time);
  const flight = advance(state.flight, input, c, dt, env, hazards(scene.course, STALL_FLOOR));
  const next: RoundState = { ...state, flight };
  if (flight.status === Status.CRASHED) return { ...next, failure: Failure.CRASH };
  const plane = flight.plane;
  if (scene.goal === Goal.TAKEOFF) {
    if (flight.tail_strike) return fail(next, Failure.TAIL_STRIKE);
    if (flight.stalled) return fail(next, Failure.STALLED);
    if (!scene.clear || !airborne(plane)) return next;
    const past = local(scene.course, plane.x) >= scene.clear.x;
    return past && wheel_height(plane, c, env) >= scene.clear.height ? { ...next, flight: { ...flight, status: Status.DONE } } : next;
  }
  const stopped = !airborne(plane) && Math.abs(ground_speed(plane)) < STOP_SPEED && flight.landings > 0 && flight.air_distance >= scene.min_air;
  const held = stopped ? state.held + dt : 0;
  if (held < STOP_HOLD) return { ...next, held };
  if (!wheels_on(scene, scene.strip, plane, c)) return fail({ ...next, held }, Failure.OFF_STRIP);
  return { ...next, held, flight: { ...flight, status: Status.DONE } };
}

function fail(state: RoundState, failure: Failure): RoundState {
  return { ...state, failure, flight: { ...state.flight, status: Status.CRASHED } };
}

export interface Result {
  stars: number;
  gentle: boolean;
  on_time: boolean;
  ms: number;
}

/** Done, gentle and under par. Gentle is a kiss and no bounce on a landing, and never hearing the stall horn on a takeoff. */
export function result(state: RoundState, par: number | null): Result {
  const { flight, scene } = state;
  const gentle = scene.goal === Goal.LAND ? flight.landings === 1 && flight.touchdown?.grade === Grade.KISS : !flight.warned;
  const ms = Math.round(flight.time * 1000);
  const on_time = par !== null && ms <= par;
  return { stars: 1 + (gentle ? 1 : 0) + (on_time ? 1 : 0), gentle, on_time, ms };
}
