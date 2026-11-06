import { angle_between, clamp, type Polygon, type Vec } from "$kit/games/play2d/geometry";
import { inside_convex } from "$kit/games/play2d/collision";
import { fit, PERFECT } from "$kit/games/play2d/precision";
import { create_boat, hull, speed, step_boat, type Boat, type Coefficients, type Input } from "./boat";
import { contacts, Grade, type Touch } from "./contact";
import { BerthKind, type Berth, type Scene } from "./world";

export { PERFECT };

/** The most the hull may be off the berth's heading and still count as docked. */
export const DOCK_ANGLE = (8 * Math.PI) / 180;
export const DOCK_SPEED = 0.1;
export const DOCK_TURN = (1 * Math.PI) / 180;
export const DOCK_HOLD = 1;
/** Alongside, the hull must lie this close to the pontoon's face along `DOCK_COVER` of the berth. */
export const DOCK_GAP = 0.3;
export const DOCK_COVER = 0.7;
/** Seconds the crew take to put the lines on once docked. */
export const LINES_TIME = 1.2;
const SAMPLES = 21;
const RAY_BACK = 0.6;

export const Status = { READY: "ready", SAILING: "sailing", PAUSED: "paused", LINES: "lines", DONE: "done", CRASHED: "crashed" } as const;
export type Status = (typeof Status)[keyof typeof Status];

export interface GameState {
  scene: Scene;
  status: Status;
  boat: Boat;
  /** Seconds sailed. */
  time: number;
  touching: readonly number[];
  touches: Touch[];
  /** Seconds the docked conditions have held. */
  held: number;
  /** Seconds since the lines started going on. */
  lines: number;
  crash: Touch | null;
  squash: number;
  points: Vec[];
  /** The latest touch, for the rings and the squeak. */
  last_touch: Touch | null;
  precision: number;
}

export function create_game(scene: Scene): GameState {
  return {
    scene,
    status: Status.READY,
    boat: create_boat(scene.start),
    time: 0,
    touching: [],
    touches: [],
    held: 0,
    lines: 0,
    crash: null,
    squash: 0,
    points: [],
    last_touch: null,
    precision: 0,
  };
}

export function set_status(state: GameState, status: Status): GameState {
  return { ...state, status };
}

/** Distance from `from` along `direction` to where the ray leaves or enters `shape`, the nearest crossing past 0. */
function ray_hit(from: Vec, direction: Vec, shape: Polygon): number | null {
  let nearest: number | null = null;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const denom = direction.x * ey - direction.y * ex;
    if (Math.abs(denom) < 1e-12) continue;
    const t = ((a.x - from.x) * ey - (a.y - from.y) * ex) / denom;
    const u = ((a.x - from.x) * direction.y - (a.y - from.y) * direction.x) / denom;
    if (t >= 0 && u >= 0 && u <= 1 && (nearest === null || t < nearest)) nearest = t;
  }
  return nearest;
}

export interface Lie {
  inside: boolean;
  angle: number;
  /** Alongside: the share of the berth with the hull within `DOCK_GAP`, and the mean gap there. */
  cover: number;
  gap: number;
  precision: number;
}

/** How the hull lies in the berth, regardless of speed. */
export function lie(boat: Boat, shape: Polygon, berth: Berth): Lie {
  const reverse = berth.bay.either && angle_between(boat.heading, berth.bay.heading) > Math.PI / 2;
  const axis = reverse ? berth.bay.heading + Math.PI : berth.bay.heading;
  const angle = angle_between(boat.heading, axis);
  if (berth.kind === BerthKind.BOX) {
    const inside = shape.every((p) => inside_convex(p, berth.bay.shape, -0.05));
    const precision = inside ? fit(shape, [boat.heading], berth.bay, DOCK_ANGLE).score : 0;
    return { inside, angle, cover: inside ? 1 : 0, gap: 0, precision };
  }
  const { a, b, out } = berth.edge!;
  let covered = 0;
  let gaps = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / (SAMPLES - 1);
    const from = { x: a.x + (b.x - a.x) * t - out.x * RAY_BACK, y: a.y + (b.y - a.y) * t - out.y * RAY_BACK };
    const hit = ray_hit(from, out, shape);
    if (hit === null) continue;
    const gap = hit - RAY_BACK;
    if (gap <= DOCK_GAP) {
      covered++;
      gaps += Math.max(0, gap);
    }
  }
  const cover = covered / SAMPLES;
  const gap = covered ? gaps / covered : DOCK_GAP;
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const along = ((boat.x - (a.x + b.x) / 2) * (b.x - a.x) + (boat.y - (a.y + b.y) / 2) * (b.y - a.y)) / length;
  const share = (off: number, room: number) => clamp(Math.abs(off) / room, 0, 1);
  const errors = [share(gap, DOCK_GAP), share(along, length * 0.25), share(angle, DOCK_ANGLE)];
  const inside = cover >= DOCK_COVER;
  const precision = inside ? 100 * errors.reduce((product, e) => product * (1 - e * e), 1) : 0;
  return { inside, angle, cover, gap, precision };
}

export function docked_now(boat: Boat, shape: Polygon, berth: Berth): Lie | null {
  if (speed(boat) >= DOCK_SPEED || Math.abs(boat.r) >= DOCK_TURN) return null;
  const now = lie(boat, shape, berth);
  return now.inside && now.angle <= DOCK_ANGLE ? now : null;
}

export interface StepOptions {
  /** The hub: touches bounce but never end anything, and there's no berth. */
  free?: boolean;
}

/** One physics step: the boat, its contacts, then the docked rule. */
export function advance(state: GameState, input: Input, c: Coefficients, dt: number, options: StepOptions = {}): GameState {
  if (state.status !== Status.SAILING && state.status !== Status.LINES) return state;
  const lines = state.status === Status.LINES;
  const shape = hull(state.boat, c.spec);
  const touch = contacts(state.boat, shape, state.scene.solids, c, state.touching);
  const boat = step_boat(state.boat, lines ? { lever: 0, wheel: input.wheel } : input, c, dt, touch.push);
  const touches = touch.started.length ? [...state.touches, ...touch.started] : state.touches;
  const last_touch = touch.started.length ? touch.started.reduce((worst, t) => (t.speed > worst.speed ? t : worst)) : state.last_touch;
  const next: GameState = { ...state, boat, time: state.time + dt, touching: touch.touching, touches, squash: touch.squash, points: touch.points, last_touch };
  if (options.free) return next;
  const crash = touch.started.find((t) => t.grade === Grade.HARD);
  if (crash && !lines) return { ...next, status: Status.CRASHED, crash };
  if (lines) {
    const elapsed = state.lines + dt;
    return elapsed >= LINES_TIME ? { ...next, lines: elapsed, status: Status.DONE } : { ...next, lines: elapsed };
  }
  const berth = state.scene.berth;
  if (!berth) return next;
  const now = docked_now(boat, hull(boat, c.spec), berth);
  if (!now) return { ...next, held: 0 };
  const held = state.held + dt;
  if (held < DOCK_HOLD) return { ...next, held };
  return { ...next, held, status: Status.LINES, lines: 0, precision: now.precision };
}

export interface Result {
  stars: number;
  gentle: boolean;
  on_time: boolean;
  perfect: boolean;
  ms: number;
}

export function result(state: GameState, par: number | null): Result {
  const gentle = state.touches.every((t) => t.grade === Grade.KISS);
  const ms = Math.round(state.time * 1000);
  const on_time = par !== null && ms <= par;
  return { stars: 1 + (gentle ? 1 : 0) + (on_time ? 1 : 0), gentle, on_time, perfect: state.precision >= PERFECT, ms };
}

export function bumps(state: GameState): number {
  return state.touches.filter((t) => t.grade !== Grade.KISS).length;
}
