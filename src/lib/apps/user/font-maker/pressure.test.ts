import { describe, expect, test } from "vitest";
import { SPEED, speed_pressures, type TimedPoint } from "./pressure";

function line(count: number, step: number, ms: number, from: TimedPoint = { x: 0, y: 0, t: 0 }): TimedPoint[] {
  return Array.from({ length: count }, (_, index) => ({ x: from.x + index * step, y: from.y, t: from.t + index * ms }));
}

describe("speed_pressures", () => {
  test("starts in the middle of the range", () => {
    expect(speed_pressures(line(1, 10, 8))).toEqual([(SPEED.min + SPEED.max) / 2]);
    expect(speed_pressures([])).toEqual([]);
  });

  test("slow strokes thicken toward max, fast strokes thin toward min", () => {
    const slow = speed_pressures(line(30, 2, 16)).at(-1)!;
    const fast = speed_pressures(line(30, 120, 8)).at(-1)!;
    expect(slow).toBeGreaterThan(0.75);
    expect(slow).toBeLessThanOrEqual(SPEED.max);
    expect(fast).toBeLessThan(0.15);
    expect(fast).toBeGreaterThanOrEqual(SPEED.min);
  });

  test("eases toward the target instead of jumping", () => {
    const points = [...line(10, 2, 16), ...line(10, 120, 8, { x: 20, y: 0, t: 160 })];
    const pressures = speed_pressures(points);
    const jump = pressures[11] - pressures[10];
    expect(jump).toBeLessThan(0);
    expect(Math.abs(jump)).toBeLessThan((SPEED.max - SPEED.min) * 0.4);
  });

  test("events with the same timestamp stay finite", () => {
    const pressures = speed_pressures([
      { x: 0, y: 0, t: 5 },
      { x: 10, y: 0, t: 5 },
    ]);
    expect(pressures.every(Number.isFinite)).toBe(true);
  });
});
