import { max_steer, steer_base, type Input, type VehicleSpec } from "./vehicle";

// Opt-in and temporary: a kinematic car has no tyres to slide, so a game that wants road speeds caps how hard it can turn
// at speed (curvature at most A_LAT / v²) before `step()`, until the core gets a slip model.
export const A_LAT = 6;

/** The share of lock the tyres allow at this speed: 1 at parking speeds, falling with the square of the speed. */
export function grip_share(speed: number, spec: VehicleSpec, a_lat = A_LAT): number {
  const v2 = speed * speed;
  if (v2 < 1e-6) return 1;
  return Math.min(1, Math.atan((steer_base(spec) * a_lat) / v2) / max_steer(spec));
}

export function with_grip(input: Input, speed: number, spec: VehicleSpec, a_lat = A_LAT): Input {
  if (input.steer === null) return input;
  const share = grip_share(speed, spec, a_lat);
  if (Math.abs(input.steer) <= share) return input;
  return { ...input, steer: Math.sign(input.steer) * share };
}

/** The steady speed the throttle holds against rolling resistance. */
export function top_speed(spec: VehicleSpec): number {
  return spec.max_forward * (1 - spec.rolling / spec.accel);
}
