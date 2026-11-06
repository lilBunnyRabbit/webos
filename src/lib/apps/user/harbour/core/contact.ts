import { penetration } from "$kit/games/play2d/collision";
import { bounds_of, bounds_overlap, type Polygon, type Vec } from "$kit/games/play2d/geometry";
import { point_velocity, type Boat, type Coefficients, type Push } from "./boat";
import type { Solid } from "./world";

export const Grade = { KISS: "kiss", BUMP: "bump", HARD: "hard" } as const;
export type Grade = (typeof Grade)[keyof typeof Grade];

/** Normal approach speeds, m/s, at the first touch on a fender; a quay wall or a moored boat takes half of each. */
export const KISS = 0.15;
export const BUMP = 0.5;

const FENDER_OMEGA = 4;
const HARD_OMEGA = 8;
const FENDER_DAMPING = 0.6;
const HARD_DAMPING = 0.25;
const FRICTION = 0.3;
const SLIP = 0.05;

export interface Touch {
  solid: number;
  /** m/s along the normal at the first instant of the touch. */
  speed: number;
  grade: Grade;
  at: Vec;
  fendered: boolean;
}

export interface Contacts {
  push: Push;
  /** Touches that began this step. */
  started: Touch[];
  /** The solids in contact now. */
  touching: readonly number[];
  points: Vec[];
  /** Deepest squash, metres, for the fender drawing and the squeak. */
  squash: number;
}

export function grade(speed: number, fendered: boolean): Grade {
  const scale = fendered ? 1 : 0.5;
  if (speed < KISS * scale) return Grade.KISS;
  if (speed < BUMP * scale) return Grade.BUMP;
  return Grade.HARD;
}

/**
 * Soft contacts: a spring-damper along the minimum translation vector at the contact point, with sliding friction, so a
 * touch at the bow swings the stern. Stiffness is per boat (a fender's natural frequency), so a big boat isn't bouncier.
 */
export function contacts(boat: Boat, shape: Polygon, solids: readonly Solid[], c: Coefficients, before: readonly number[]): Contacts {
  const box = bounds_of(shape);
  let fx = 0;
  let fy = 0;
  let n = 0;
  let squash = 0;
  const started: Touch[] = [];
  const touching: number[] = [];
  const points: Vec[] = [];
  for (const solid of solids) {
    if (!bounds_overlap(box, solid.box)) continue;
    const hit = penetration(shape, solid.shape);
    if (!hit) continue;
    touching.push(solid.id);
    points.push(hit.point);
    squash = Math.max(squash, hit.depth);
    const omega = solid.fendered ? FENDER_OMEGA : HARD_OMEGA;
    const k = c.mx * omega * omega;
    const damping = 2 * (solid.fendered ? FENDER_DAMPING : HARD_DAMPING) * Math.sqrt(k * c.mx);
    const v = point_velocity(boat, hit.point);
    const vn = v.x * hit.normal.x + v.y * hit.normal.y;
    if (!before.includes(solid.id)) {
      const speed = Math.max(0, -vn);
      started.push({ solid: solid.id, speed, grade: grade(speed, solid.fendered), at: hit.point, fendered: solid.fendered });
    }
    const normal = Math.max(0, k * hit.depth - damping * vn);
    const tangent = { x: -hit.normal.y, y: hit.normal.x };
    const vt = v.x * tangent.x + v.y * tangent.y;
    const friction = -FRICTION * normal * Math.max(-1, Math.min(1, vt / SLIP));
    const px = hit.normal.x * normal + tangent.x * friction;
    const py = hit.normal.y * normal + tangent.y * friction;
    fx += px;
    fy += py;
    n += (hit.point.x - boat.x) * py - (hit.point.y - boat.y) * px;
  }
  return { push: { fx, fy, n }, started, touching, points, squash };
}
