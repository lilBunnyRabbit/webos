import { air_of, G, type Coefficients, type Env, type Plane } from "./plane";

/** The cable lets go once it pulls this steeply from the drum: past it the winch would only drag the glider down. */
export const RELEASE_ANGLE = (70 * Math.PI) / 180;
const MIN_LEFT = 40;

/** The winch's pull, newtons, toward the drum at `drum` metres along the world, ground height `ground`: it reels in to hold the glider near 1.5 × its stall, at most 1.2 × its weight. Null once released. */
export function winch_pull(plane: Plane, c: Coefficients, drum: number, ground: number, env: Env): { x: number; y: number } | null {
  const dx = drum - plane.x;
  const dy = ground - plane.h;
  if (dx < MIN_LEFT || Math.atan2(-dy, dx) > RELEASE_ANGLE) return null;
  const weight = c.mass * G;
  const target = c.spec.stall_speed * 1.5;
  const speed = air_of(plane, c, env).speed;
  const tension = Math.max(0.2 * weight, Math.min(1.2 * weight, weight * (0.7 + (target - speed) * 0.12)));
  const length = Math.hypot(dx, dy);
  return { x: (tension * dx) / length, y: (tension * dy) / length };
}
