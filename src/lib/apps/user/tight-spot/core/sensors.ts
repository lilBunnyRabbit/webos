import { bounds_of, bounds_overlap, type Pose, type Vec } from "./geometry";
import type { Obstacles } from "./obstacles";
import { body_ends, corners, HATCHBACK, trailer_corners, trailer_pose, type Placement, type VehicleSpec } from "./vehicle";

export const SENSOR_RANGE = 1.6;
const SIDE_REACH = 0.05;

export const End = { FRONT: "front", REAR: "rear" } as const;
export type End = (typeof End)[keyof typeof End];

function local(pose: Pose, point: Vec, sign: number): Vec {
  const dx = point.x - pose.x;
  const dy = point.y - pose.y;
  const cos = Math.cos(pose.heading);
  const sin = Math.sin(pose.heading);
  return { x: sign * (dx * cos + dy * sin), y: -dx * sin + dy * cos };
}

function clip(a: Vec, b: Vec, lo: number, hi: number, key: "x" | "y"): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const d = b[key] - a[key];
  for (const [bound, side] of [
    [lo, 1],
    [hi, -1],
  ] as const) {
    const start = side * (a[key] - bound);
    const delta = side * d;
    if (Math.abs(delta) < 1e-12) {
      if (start < 0) return null;
      continue;
    }
    const t = -start / delta;
    if (delta > 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
  }
  return t0 <= t1 ? [t0, t1] : null;
}

export interface SensorFrame {
  pose: Pose;
  /** From `pose` along its axis to the bumper, forward for the front and backward for the rear. */
  bumper: number;
  width: number;
  body: Vec[];
}

/** Towing, the rear sensors are the trailer's: its tail is what reverses into things. */
export function sensor_frame(car: Placement, end: End, spec: VehicleSpec = HATCHBACK): SensorFrame {
  const t = spec.trailer;
  if (end === End.REAR && t) {
    const pose = trailer_pose(car, t);
    return { pose, bumper: t.drawbar + t.box_length - t.axle, width: t.width, body: trailer_corners(car, t) };
  }
  const ends = body_ends(spec);
  const bumper = end === End.FRONT ? ends.front : -ends.rear;
  return { pose: car, bumper, width: spec.width, body: corners(car, spec) };
}

// Like ultrasonic parking sensors: only the strip the car would sweep driving straight that way counts.
export function sensor(car: Placement, near: Obstacles, end: End, spec: VehicleSpec = HATCHBACK): number | null {
  const sign = end === End.FRONT ? 1 : -1;
  const { pose, bumper, width, body } = sensor_frame(car, end, spec);
  const band = width / 2 + SIDE_REACH;
  const reach = bounds_of(body);
  let best = Infinity;
  for (let i = 0; i < near.solids.length; i++) {
    if (!bounds_overlap(reach, near.bounds[i], SENSOR_RANGE)) continue;
    const shape = near.solids[i].shape.map((point) => local(pose, point, sign));
    for (let k = 0; k < shape.length; k++) {
      const a = shape[k];
      const b = shape[(k + 1) % shape.length];
      const across = clip(a, b, -band, band, "y");
      if (!across) continue;
      const lerp = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const p = lerp(across[0]);
      const q = lerp(across[1]);
      const ahead = clip(p, q, bumper, bumper + SENSOR_RANGE, "x");
      if (!ahead) continue;
      const x0 = p.x + (q.x - p.x) * ahead[0];
      const x1 = p.x + (q.x - p.x) * ahead[1];
      best = Math.min(best, Math.min(x0, x1) - bumper);
    }
  }
  return best === Infinity ? null : Math.max(0, best);
}

export function beep_period(distance: number): number {
  if (distance < 0.3) return 0;
  return 0.12 + ((distance - 0.3) / (SENSOR_RANGE - 0.3)) * 0.6;
}
