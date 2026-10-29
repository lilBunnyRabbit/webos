import { F1_CAR, max_steer, steer_base, type Input, type VehicleSpec } from "../../core/vehicle";

// Game-owned and temporary: a kinematic car has no tyres to slide, so Hot Lap caps how hard it can turn at speed
// (curvature at most A_LAT / v²) until the core gets a slip model.
export const A_LAT = 25;

// The race tune of the garage's F1 car, which keeps its parking pace.
export const SPEC: VehicleSpec = { ...F1_CAR, max_forward: 80, accel: 15, brake: 36, steer_time: 0.6 };
export const GRASS_SPEC: VehicleSpec = { ...SPEC, max_forward: 25, rolling: 8 };

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
