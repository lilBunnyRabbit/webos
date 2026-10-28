import { centroid } from "../../core/geometry";
import { collide, type Obstacles } from "../../core/obstacles";
import { inflate } from "../../core/planner";
import { HATCHBACK, pose_from_centre, type Placement, type VehicleSpec } from "../../core/vehicle";
import { parked_in } from "./game";
import type { Bay } from "./world";

export function parked_poses(bay: Bay, near: Obstacles, margin = 0.05, spec: VehicleSpec = HATCHBACK): Placement[] {
  const centre = centroid(bay.shape);
  const body = inflate(spec, margin);
  const headings = bay.either ? [bay.heading, bay.heading + Math.PI] : [bay.heading];
  const found: { pose: Placement; off: number }[] = [];
  for (const heading of headings) {
    const along = { x: Math.cos(heading), y: Math.sin(heading) };
    for (let a = -1.2; a <= 1.2 + 1e-9; a += 0.2) {
      for (let s = -0.4; s <= 0.4 + 1e-9; s += 0.1) {
        const at = { x: centre.x + along.x * a - along.y * s, y: centre.y + along.y * a + along.x * s, heading };
        const axle = pose_from_centre(at, spec);
        const pose: Placement = spec.trailer ? { ...axle, trailer: { heading, roll: [0, 0] } } : axle;
        if (!parked_in(pose, bay, spec) || collide(pose, near, body)) continue;
        found.push({ pose, off: Math.abs(a) + Math.abs(s) * 2 });
      }
    }
  }
  return found.sort((p, q) => p.off - q.off).map((each) => each.pose);
}
