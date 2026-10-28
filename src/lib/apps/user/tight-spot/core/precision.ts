import { angle_between, clamp, type Polygon, type Vec } from "./geometry";
import type { Bay } from "./scene";

/** The most a body may be off its bay's axis and still count as straight in it. */
export const MAX_ANGLE = (5 * Math.PI) / 180;
export const PERFECT = 95;

export interface Precision {
  /** 0 to 100. */
  score: number;
  /** Metres off the middle across the bay, and along it; radians off its axis. */
  side: number;
  depth: number;
  angle: number;
}

/** Distance from `from`, inside the convex polygon, to its boundary along the unit `direction`. */
function ray_to_edge(from: Vec, direction: Vec, shape: Polygon): number {
  let nearest = Infinity;
  for (let i = 0; i < shape.length; i++) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };
    const denominator = direction.x * edge.y - direction.y * edge.x;
    if (Math.abs(denominator) < 1e-12) continue;
    const to_a = { x: a.x - from.x, y: a.y - from.y };
    const t = (to_a.x * edge.y - to_a.y * edge.x) / denominator;
    const u = (to_a.x * direction.y - to_a.y * direction.x) / denominator;
    if (t >= -1e-9 && u >= -1e-9 && u <= 1 + 1e-9) nearest = Math.min(nearest, Math.max(0, t));
  }
  return nearest;
}

/**
 * How well a footprint sits in its bay. The gaps to the bay's sides and ends are the shortest rays from any of
 * `points` (every corner of every body), so centring judges the whole footprint; the angle is the worst of `headings`
 * against the bay's axis (either way round for an `either` bay, decided by the first heading). Each error is a share of
 * what the bay allows (half the side room, half the end room, the 5° that still counts as straight) and the score is
 * 100 × Π(1 − e²): 100 dead centre and square, 0 against a line or at 5°.
 */
export function fit(points: readonly Vec[], headings: readonly number[], bay: Bay): Precision {
  const reverse = bay.either && angle_between(headings[0], bay.heading) > Math.PI / 2;
  const axis = reverse ? bay.heading + Math.PI : bay.heading;
  const along = { x: Math.cos(axis), y: Math.sin(axis) };
  const across = { x: -along.y, y: along.x };
  const back = { x: -along.x, y: -along.y };
  const other = { x: -across.x, y: -across.y };
  const gap = (direction: Vec) => Math.min(...points.map((point) => ray_to_edge(point, direction, bay.shape)));
  const front = gap(along);
  const rear = gap(back);
  const right = gap(across);
  const left = gap(other);
  const side = (right - left) / 2;
  const depth = (front - rear) / 2;
  const angle = Math.max(...headings.map((heading) => angle_between(heading, axis)));
  const share = (off: number, room: number) => (room > 1e-9 ? clamp(Math.abs(off) / room, 0, 1) : 0);
  const errors = [share(side, (right + left) / 2), share(depth, (front + rear) / 2), share(angle, MAX_ANGLE)];
  const score = 100 * errors.reduce((product, e) => product * (1 - e * e), 1);
  return { score, side: Math.abs(side), depth: Math.abs(depth), angle };
}
