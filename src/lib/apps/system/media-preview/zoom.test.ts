import { describe, expect, test } from "vitest";
import { clamp, distance, fit_scale, midpoint, rotated_size } from "./zoom";

describe("zoom helpers", () => {
  test("clamp keeps a value inside the range", () => {
    expect(clamp(7, 0.25, 5)).toBe(5);
    expect(clamp(0.1, 0.25, 5)).toBe(0.25);
    expect(clamp(2, 0.25, 5)).toBe(2);
  });

  test("distance and midpoint of two pointers", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 10 }, { x: 4, y: 20 })).toEqual({ x: 2, y: 15 });
  });

  test("a quarter turn swaps width and height, a half turn doesn't", () => {
    expect(rotated_size({ width: 400, height: 300 }, 90)).toEqual({ width: 300, height: 400 });
    expect(rotated_size({ width: 400, height: 300 }, 180)).toEqual({ width: 400, height: 300 });
  });

  test("fit_scale fits the tighter side and scales small images up", () => {
    expect(fit_scale({ width: 2000, height: 1000 }, { width: 1000, height: 1000 })).toBe(0.5);
    expect(fit_scale({ width: 100, height: 50 }, { width: 400, height: 400 })).toBe(4);
  });

  test("fit_scale survives an unloaded image or a collapsed stage", () => {
    expect(fit_scale({ width: 0, height: 0 }, { width: 400, height: 400 })).toBe(1);
    expect(fit_scale({ width: 100, height: 100 }, { width: -10, height: 400 })).toBe(0);
  });
});
