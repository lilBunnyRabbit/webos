import { air_of, airborne, CALM, point_at, point_climb, ROUND, step_plane, type Coefficients, type Env, type Input, type Plane } from "./plane";

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

export const CrashKind = { HARD: "hard", NOSE_OVER: "nose-over", WINGTIP: "wingtip", GROUND: "ground" } as const;
export type CrashKind = (typeof CrashKind)[keyof typeof CrashKind];

export interface Touchdown {
  /** m/s, the main wheels' (or the tail wheel's, tail first) closing speed with the ground. */
  sink: number;
  grade: Grade;
  tail_first: boolean;
  x: number;
  at: number;
}

export const Status = { FLYING: "flying", PAUSED: "paused", CRASHED: "crashed" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface Flight {
  plane: Plane;
  status: Status;
  time: number;
  air_time: number;
  touchdown: Touchdown | null;
  crash: { kind: CrashKind; sink: number } | null;
  flown: boolean;
}

/** Wheels leave the ground for this long before the next contact counts as a landing, so a bounce on the roll isn't one. */
const LANDING_AIR_TIME = 0.6;

export function create_flight(plane: Plane): Flight {
  return { plane, status: Status.FLYING, time: 0, air_time: 0, touchdown: null, crash: null, flown: false };
}

/** Within 3° of the lift curve's peak and off the ground: the horn sounds. */
export function stall_warning(plane: Plane, c: Coefficients, env: Env = CALM): boolean {
  return airborne(plane) && air_of(plane, c, env).alpha > c.alpha_break + ROUND - 0.05;
}

export function wheel_height(plane: Plane, c: Coefficients): number {
  const { main, tail } = c.spec.gear;
  return Math.max(0, Math.min(point_at(plane, main).height, point_at(plane, tail).height));
}

function crashed(plane: Plane, c: Coefficients): CrashKind | null {
  const s = c.spec;
  if (point_at(plane, s.prop).height < 0) return plane.vy < -1.5 ? CrashKind.GROUND : CrashKind.NOSE_OVER;
  if (s.hull.some((p) => point_at(plane, p).height < 0)) return CrashKind.GROUND;
  const wing = point_at(plane, s.wing).height;
  if (wing - (s.span / 2) * Math.abs(Math.sin(plane.bank)) < 0) return CrashKind.WINGTIP;
  return null;
}

export function advance(flight: Flight, input: Input, c: Coefficients, dt: number, env: Env = CALM): Flight {
  if (flight.status !== Status.FLYING) return flight;
  const before = flight.plane;
  const plane = step_plane(before, input, c, dt, env);
  const up = airborne(plane);
  const air_time = up ? flight.air_time + dt : 0;
  let touchdown = flight.touchdown;
  const landed = !up && flight.air_time >= LANDING_AIR_TIME;
  if (landed) {
    const tail_first = plane.tail_on && !plane.main_on;
    const sink = Math.max(0, -point_climb(before, tail_first ? c.spec.gear.tail : c.spec.gear.main));
    touchdown = { sink, grade: grade(sink), tail_first, x: plane.x, at: flight.time };
  }
  const next: Flight = { ...flight, plane, time: flight.time + dt, air_time, touchdown, flown: flight.flown || air_time >= LANDING_AIR_TIME };
  if (landed && touchdown!.grade === Grade.HARD) return { ...next, status: Status.CRASHED, crash: { kind: CrashKind.HARD, sink: touchdown!.sink } };
  const kind = crashed(plane, c);
  if (kind) return { ...next, status: Status.CRASHED, crash: { kind, sink: Math.max(0, -plane.vy) } };
  return next;
}
