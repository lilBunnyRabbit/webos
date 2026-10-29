import { F1_CAR, max_steer, steer_base, type Input, type VehicleSpec } from "../../core/vehicle";

// Game-owned and temporary: a kinematic car has no tyres to slide, so Hot Lap caps how hard it can turn at speed
// (curvature at most A_LAT / v²) until the core gets a slip model.
export const A_LAT = 6;

export const SPEC: VehicleSpec = F1_CAR;
export const GRASS_SPEC: VehicleSpec = { ...F1_CAR, max_forward: 5, rolling: 4 };

export function grip_share(speed: number, spec: VehicleSpec = SPEC): number {
  const v2 = speed * speed;
  if (v2 < 1e-6) return 1;
  return Math.min(1, Math.atan((steer_base(spec) * A_LAT) / v2) / max_steer(spec));
}

export function with_grip(input: Input, speed: number, spec: VehicleSpec = SPEC): Input {
  if (input.steer === null) return input;
  const share = grip_share(speed, spec);
  if (Math.abs(input.steer) <= share) return input;
  return { ...input, steer: Math.sign(input.steer) * share };
}

/** The steady speed the throttle holds against rolling resistance. */
export function top_speed(spec: VehicleSpec = SPEC): number {
  return spec.max_forward * (1 - spec.rolling / spec.accel);
}
