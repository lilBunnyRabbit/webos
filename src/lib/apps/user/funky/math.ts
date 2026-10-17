// Pure built-ins, shared by constant folding and the simulator so a folded constant equals what the simulator computes.
// SimplePlanes maps these onto Unity's Mathf, so they follow Mathf: round() is half to even, sign(0) is 1.

const DEG = Math.PI / 180;

export const clamp = (value: number, min: number, max: number) => (value < min ? min : value > max ? max : value);
export const clamp01 = (value: number) => clamp(value, 0, 1);
export const repeat = (t: number, length: number) => clamp(t - Math.floor(t / length) * length, 0, length);

export function round_half_even(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (fraction > 0.5) return floor + 1;
  if (fraction < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

export function delta_angle(current: number, target: number): number {
  const delta = repeat(target - current, 360);
  return delta > 180 ? delta - 360 : delta;
}

export const PURE: Record<string, (args: number[]) => number> = {
  abs: ([x]) => Math.abs(x),
  ceil: ([x]) => Math.ceil(x),
  floor: ([x]) => Math.floor(x),
  round: ([x]) => round_half_even(x),
  sign: ([x]) => (x >= 0 ? 1 : -1),
  sqrt: ([x]) => Math.sqrt(x),
  exp: ([x]) => Math.exp(x),
  pow: ([x, p]) => Math.pow(x, p),
  log: ([x, base]) => Math.log(x) / Math.log(base),
  log10: ([x]) => Math.log10(x),
  min: ([a, b]) => Math.min(a, b),
  max: ([a, b]) => Math.max(a, b),
  clamp: ([x, min, max]) => clamp(x, min, max),
  clamp01: ([x]) => clamp01(x),
  lerp: ([a, b, t]) => a + (b - a) * clamp01(t),
  lerpunclamped: ([a, b, t]) => a + (b - a) * t,
  lerpangle: ([a, b, t]) => a + delta_angle(a, b) * clamp01(t),
  inverselerp: ([a, b, x]) => (a === b ? 0 : clamp01((x - a) / (b - a))),
  smoothstep: ([a, b, t]) => {
    const s = clamp01(t);
    const eased = -2 * s * s * s + 3 * s * s;
    return b * eased + a * (1 - eased);
  },
  deltaangle: ([a, b]) => delta_angle(a, b),
  pingpong: ([x, length]) => length - Math.abs(repeat(x, length * 2) - length),
  repeat: ([x, length]) => repeat(x, length),
  sin: ([x]) => Math.sin(x * DEG),
  cos: ([x]) => Math.cos(x * DEG),
  tan: ([x]) => Math.tan(x * DEG),
  asin: ([x]) => Math.asin(x) / DEG,
  acos: ([x]) => Math.acos(x) / DEG,
  atan: ([x]) => Math.atan(x) / DEG,
  atan2: ([y, x]) => Math.atan2(y, x) / DEG,
};
