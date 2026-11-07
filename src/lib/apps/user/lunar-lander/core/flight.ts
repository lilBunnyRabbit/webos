import { wrap_angle } from "$kit/games/play2d/geometry";
import { DEG, offset, step_ship, world_point, type Coefficients, type Env, type Input, type Ship } from "./lander";
import { in_rock, pad_under, type Terrain } from "./world";

export const Grade = { KISS: "kiss", FIRM: "firm", HEAVY: "heavy", HARD: "hard" } as const;
export type Grade = (typeof Grade)[keyof typeof Grade];

export const KISS_SINK = 0.5;
export const FIRM_SINK = 1.2;

export function grade(sink: number, safe: number): Grade {
  if (sink < KISS_SINK) return Grade.KISS;
  if (sink < FIRM_SINK) return Grade.FIRM;
  if (sink < safe) return Grade.HEAVY;
  return Grade.HARD;
}

export const CrashKind = { HARD: "hard", SLID: "slid", TILTED: "tilted", HULL: "hull", ROCK: "rock", LOST: "lost" } as const;
export type CrashKind = (typeof CrashKind)[keyof typeof CrashKind];

export interface Touchdown {
  sink: number;
  slide: number;
  /** Degrees off square to the ground under the feet. */
  tilt: number;
  grade: Grade;
  x: number;
  at: number;
  /** The pad both feet came down on, or −1. */
  pad: number;
  /** Metres from the pad's centre. */
  off_centre: number;
}

export const Status = { READY: "ready", FLYING: "flying", PAUSED: "paused", DONE: "done", CRASHED: "crashed" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface Flight {
  ship: Ship;
  status: Status;
  time: number;
  air_time: number;
  touchdown: Touchdown | null;
  landings: number;
  /** A touchdown that wasn't a kiss: the gentle star is gone. */
  rough: boolean;
  crash: { kind: CrashKind; sink: number } | null;
  flown: boolean;
}

/** Off every foot this long before the next contact counts as a landing, so a skip on the pad isn't one. */
const LANDING_AIR_TIME = 0.4;
const LOST_MARGIN = 60;

export function create_flight(ship: Ship, status: Status = Status.FLYING): Flight {
  const standing = ship.on.some(Boolean);
  return { ship, status, time: 0, air_time: standing ? 0 : LANDING_AIR_TIME, touchdown: null, landings: 0, rough: false, crash: null, flown: false };
}

export function airborne(ship: Ship): boolean {
  return !ship.on.some(Boolean);
}

export function feet_x(ship: Ship, c: Coefficients): number[] {
  return c.spec.feet.map((foot) => world_point(ship, foot).x);
}

function touchdown_of(before: Ship, after: Ship, c: Coefficients, env: Env, terrain: Terrain, time: number): Touchdown {
  const s = c.spec;
  let sink = 0;
  s.feet.forEach((foot, i) => {
    if (!after.on[i]) return;
    const r = offset(before.angle, foot);
    sink = Math.max(sink, -(before.vy + before.spin * r.x));
  });
  const xs = feet_x(after, c);
  const slope = Math.atan2(env.ground(xs[xs.length - 1]) - env.ground(xs[0]), xs[xs.length - 1] - xs[0]);
  const tilt = Math.abs(wrap_angle(after.angle - slope)) / DEG;
  const pad = pad_under(terrain, xs);
  const centre = pad >= 0 ? (terrain.pads[pad].x0 + terrain.pads[pad].x1) / 2 : after.x;
  return { sink, slide: Math.abs(before.vx), tilt, grade: grade(sink, s.safe.sink), x: after.x, at: time, pad, off_centre: Math.abs(after.x - centre) };
}

function crashed(ship: Ship, c: Coefficients, env: Env, terrain: Terrain): CrashKind | null {
  for (const p of c.spec.hull) {
    const at = world_point(ship, p);
    if (at.y < env.ground(at.x)) return CrashKind.HULL;
    if (in_rock(terrain, at)) return CrashKind.ROCK;
  }
  for (const foot of c.spec.feet) if (in_rock(terrain, world_point(ship, foot))) return CrashKind.ROCK;
  if (ship.x < terrain.x0 - LOST_MARGIN || ship.x > terrain.x1 + LOST_MARGIN) return CrashKind.LOST;
  return null;
}

export function advance(flight: Flight, input: Input, c: Coefficients, dt: number, env: Env, terrain: Terrain): Flight {
  if (flight.status !== Status.FLYING) return flight;
  const before = flight.ship;
  const ship = step_ship(before, input, c, dt, env);
  const up = airborne(ship);
  const landed = !up && flight.air_time >= LANDING_AIR_TIME;
  const touchdown = landed ? touchdown_of(before, ship, c, env, terrain, flight.time) : flight.touchdown;
  const next: Flight = {
    ...flight,
    ship,
    time: flight.time + dt,
    air_time: up ? flight.air_time + dt : 0,
    touchdown,
    landings: flight.landings + (landed ? 1 : 0),
    rough: flight.rough || (landed && touchdown!.grade !== Grade.KISS),
    flown: flight.flown || (up && flight.air_time >= 1),
  };
  if (landed) {
    const safe = c.spec.safe;
    const kind = touchdown!.grade === Grade.HARD ? CrashKind.HARD : touchdown!.slide >= safe.slide ? CrashKind.SLID : touchdown!.tilt >= safe.tilt ? CrashKind.TILTED : null;
    if (kind) return { ...next, status: Status.CRASHED, crash: { kind, sink: touchdown!.sink } };
  }
  const kind = crashed(ship, c, env, terrain);
  if (kind) return { ...next, status: Status.CRASHED, crash: { kind, sink: Math.max(0, -ship.vy) } };
  return next;
}
