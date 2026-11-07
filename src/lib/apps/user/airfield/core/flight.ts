import { air_of, airborne, CALM, clearance, ground_speed, point_at, point_climb, ROUND, separation, step_plane, type BodyPoint, type Coefficients, type Env, type Input, type Plane } from "./plane";

export const Grade = { KISS: "kiss", FIRM: "firm", HEAVY: "heavy", HARD: "hard" } as const;
export type Grade = (typeof Grade)[keyof typeof Grade];

export const KISS_SINK = 0.6;
export const FIRM_SINK = 1.5;
export const HARD_SINK = 3;

export function grade(sink: number): Grade {
  if (sink < KISS_SINK) return Grade.KISS;
  if (sink < FIRM_SINK) return Grade.FIRM;
  if (sink < HARD_SINK) return Grade.HEAVY;
  return Grade.HARD;
}

export const CrashKind = {
  HARD: "hard",
  NOSE_OVER: "nose-over",
  POD: "pod",
  GROUND: "ground",
  OBSTACLE: "obstacle",
  WATER: "water",
  STALL: "stall",
} as const;
export type CrashKind = (typeof CrashKind)[keyof typeof CrashKind];

export interface Touchdown {
  /** m/s, the main wheels' (or the other wheel's, when it touched first) closing speed with the ground. */
  sink: number;
  grade: Grade;
  aux_first: boolean;
  x: number;
  at: number;
}

export const Status = { READY: "ready", FLYING: "flying", PAUSED: "paused", DONE: "done", CRASHED: "crashed" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface Flight {
  plane: Plane;
  status: Status;
  time: number;
  air_time: number;
  /** Metres flown with every wheel off the ground, all told. */
  air_distance: number;
  touchdown: Touchdown | null;
  landings: number;
  crash: { kind: CrashKind; sink: number } | null;
  flown: boolean;
  /** Armed by a touchdown in a plane that has one, until the throttle comes up or the plane is down to taxi speed. */
  autobrake: boolean;
  tail_strike: boolean;
  warned: boolean;
  stalled: boolean;
}

export interface Hazards {
  solid?: (x: number, height: number) => boolean;
  water?: (x: number) => boolean;
  stall_floor?: number;
}

/** Wheels leave the ground for this long before the next contact counts as a landing, so a bounce on the roll isn't one. */
const LANDING_AIR_TIME = 0.6;
const AUTOBRAKE_OFF_SPEED = 2;
/** A stall this close to the ground is a crash; a full-stall touchdown from a metre or two isn't. */
const STALL_GRACE = 2;

export function create_flight(plane: Plane, status: Status = Status.FLYING): Flight {
  return { plane, status, time: 0, air_time: 0, air_distance: 0, touchdown: null, landings: 0, crash: null, flown: false, autobrake: false, tail_strike: false, warned: false, stalled: false };
}

/** Within 3° of the lift curve's peak and off the ground: the horn sounds. */
export function stall_warning(plane: Plane, c: Coefficients, env: Env = CALM): boolean {
  return airborne(plane) && air_of(plane, c, env).alpha > c.alpha_break + ROUND - 0.05;
}

export function wheel_height(plane: Plane, c: Coefficients, env: Env = CALM): number {
  const { main, aux } = c.spec.gear;
  return Math.max(0, Math.min(clearance(plane, main, env).height, clearance(plane, aux, env).height));
}

function world_point(plane: Plane, p: BodyPoint): { x: number; height: number } {
  const at = point_at(plane, p);
  return { x: plane.x + at.s * Math.cos(plane.yaw), height: at.height };
}

function crashed(plane: Plane, c: Coefficients, env: Env, hazards: Hazards): CrashKind | null {
  const s = c.spec;
  if (s.prop && clearance(plane, s.prop, env).height < 0) {
    if (s.engine === "jet") return CrashKind.POD;
    return plane.vy < -1.5 ? CrashKind.GROUND : CrashKind.NOSE_OVER;
  }
  if (s.hull.some((p) => clearance(plane, p, env).height < 0)) return CrashKind.GROUND;
  const points = [...s.hull, s.gear.main, s.gear.aux, ...(s.prop ? [s.prop] : [])];
  if (hazards.solid && points.some((p) => {
    const at = world_point(plane, p);
    return hazards.solid!(at.x, at.height);
  })) return CrashKind.OBSTACLE;
  if (hazards.water && !airborne(plane) && hazards.water(plane.x)) return CrashKind.WATER;
  return null;
}

export function advance(flight: Flight, input: Input, c: Coefficients, dt: number, env: Env = CALM, hazards: Hazards = {}): Flight {
  if (flight.status !== Status.FLYING) return flight;
  const s = c.spec;
  const before = flight.plane;
  const braked = flight.autobrake && before.main_on ? { ...input, brake: Math.max(input.brake, s.autobrake) } : input;
  const plane = step_plane(before, braked, c, dt, env);
  const up = airborne(plane);
  const air_time = up ? flight.air_time + dt : 0;
  let touchdown = flight.touchdown;
  const landed = !up && flight.air_time >= LANDING_AIR_TIME;
  if (landed) {
    const aux_first = plane.aux_on && !plane.main_on;
    const sink = Math.max(0, -point_climb(before, aux_first ? s.gear.aux : s.gear.main));
    touchdown = { sink, grade: grade(sink), aux_first, x: plane.x, at: flight.time };
  }
  let autobrake = flight.autobrake || (landed && s.autobrake > 0);
  if (autobrake && ((input.throttle > 0.05 && input.reverse === 0) || (!up && Math.abs(ground_speed(plane)) < AUTOBRAKE_OFF_SPEED))) autobrake = false;
  const tail_strike = flight.tail_strike || (!!s.tail_skid && clearance(plane, s.tail_skid, env).height < 0);
  const air = air_of(plane, c, env);
  const sep = up ? separation(air.alpha, c) : 0;
  const next: Flight = {
    ...flight,
    plane,
    time: flight.time + dt,
    air_time,
    air_distance: flight.air_distance + (up ? Math.abs(ground_speed(plane)) * dt : 0),
    touchdown,
    landings: flight.landings + (landed ? 1 : 0),
    flown: flight.flown || air_time >= LANDING_AIR_TIME,
    autobrake,
    tail_strike,
    warned: flight.warned || stall_warning(plane, c, env),
    stalled: flight.stalled || sep > 0.5,
  };
  if (landed && touchdown!.grade === Grade.HARD) return { ...next, status: Status.CRASHED, crash: { kind: CrashKind.HARD, sink: touchdown!.sink } };
  const kind = crashed(plane, c, env, hazards);
  if (kind) return { ...next, status: Status.CRASHED, crash: { kind, sink: Math.max(0, -plane.vy) } };
  if (hazards.stall_floor !== undefined && sep > 0.5) {
    const agl = wheel_height(plane, c, env);
    if (agl > STALL_GRACE && agl < hazards.stall_floor) return { ...next, status: Status.CRASHED, crash: { kind: CrashKind.STALL, sink: Math.max(0, -plane.vy) } };
  }
  return next;
}
