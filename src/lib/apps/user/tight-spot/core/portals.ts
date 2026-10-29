import { inside_convex } from "./collision";
import type { Pose, Vec } from "./geometry";
import type { Portal } from "./scene";
import type { Car, Placement } from "./vehicle";

function turn_of(portal: Portal): number {
  return portal.to.heading - portal.from.heading;
}

export function carry_point(point: Vec, portal: Portal): Vec {
  const turn = turn_of(portal);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const dx = point.x - portal.from.x;
  const dy = point.y - portal.from.y;
  return { x: portal.to.x + dx * cos - dy * sin, y: portal.to.y + dx * sin + dy * cos };
}

export function carry<T extends Placement>(pose: T, portal: Portal): T {
  const turn = turn_of(portal);
  const moved = { ...pose, ...carry_point(pose, portal), heading: pose.heading + turn };
  if (!pose.trailers) return moved;
  return { ...moved, trailers: pose.trailers.map((trailer) => ({ ...trailer, heading: trailer.heading + turn })) };
}

/** `moving` is 1 rolling forward, −1 in reverse: a mouth takes a rig whose reference point moves through it either way, never one moving back out. */
export function portal_at(pose: Pose, moving: number, portals: readonly Portal[]): Portal | null {
  if (moving === 0) return null;
  for (const portal of portals) {
    if (Math.cos(pose.heading - portal.heading) * moving <= 0) continue;
    if (inside_convex(pose, portal.mouth)) return portal;
  }
  return null;
}

export function through<T extends Placement>(pose: T, moving: number, portals: readonly Portal[]): T {
  if (portals.length === 0) return pose;
  const portal = portal_at(pose, moving, portals);
  return portal ? carry(pose, portal) : pose;
}

export function pass_portals(car: Car, portals: readonly Portal[]): Car {
  return through(car, Math.sign(car.speed), portals);
}
