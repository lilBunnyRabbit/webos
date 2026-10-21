export const PressureMode = { EVEN: "even", SPEED: "speed" } as const;
export type PressureMode = (typeof PressureMode)[keyof typeof PressureMode];
export const PRESSURE_MODES = [PressureMode.EVEN, PressureMode.SPEED] as const;

export interface TimedPoint {
  x: number;
  y: number;
  t: number;
}

export interface SpeedOptions {
  min: number;
  max: number;
  // Font units per ms at which a stroke reaches `min`: the box is about 2.2× the signature pad's 600 units across.
  max_speed: number;
  smoothing: number;
}

export const SPEED: SpeedOptions = { min: 0.1, max: 0.8, max_speed: 5, smoothing: 0.35 };

export function speed_pressures(points: readonly TimedPoint[], options: SpeedOptions = SPEED): number[] {
  const { min, max, max_speed, smoothing } = options;
  const span = max - min;
  let pressure = (min + max) / 2;
  return points.map((point, index) => {
    if (index === 0) return pressure;
    const previous = points[index - 1];
    const speed = Math.hypot(point.x - previous.x, point.y - previous.y) / Math.max(1, point.t - previous.t);
    const target = max - span * Math.min(1, Math.max(0, speed / max_speed));
    pressure += (target - pressure) * smoothing;
    return pressure;
  });
}
