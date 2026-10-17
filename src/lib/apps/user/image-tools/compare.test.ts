import { describe, expect, test } from "vitest";
import { changed_percent, compare_images, tolerance_level } from "./compare";
import type { Pixels } from "./patch";

function render(width: number, height: number, dx = 0, dy = 0): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x - dx;
      const v = y - dy;
      const p = (y * width + x) * 4;
      data[p] = 128 + 100 * Math.sin(u / 9) * Math.cos(v / 13);
      data[p + 1] = 128 + 100 * Math.sin((u + v) / 17);
      data[p + 2] = 128 + 100 * Math.cos(u / 21 - v / 7);
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

function stamp(pixels: Pixels, x0: number, y0: number, size: number): Pixels {
  const data = new Uint8ClampedArray(pixels.data);
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) data.set([255, 255, 255, 255], (y * pixels.width + x) * 4);
  }
  return { ...pixels, data };
}

describe("changed_percent", () => {
  const diff = { data: new Uint8Array([0, 200, 0, 0, 200, 200, 0, 0]), width: 4, height: 2, factor: 2 };

  test("counts changed cells inside the overlap", () => {
    expect(changed_percent(diff, 40, { x: 0, y: 0, width: 8, height: 4 })).toBe(37.5);
    expect(changed_percent(diff, 40, { x: 0, y: 0, width: 4, height: 4 })).toBe(75);
  });

  test("no overlap is all changed", () => {
    expect(changed_percent(diff, 40, null)).toBe(100);
  });
});

describe("compare_images", () => {
  const before = render(200, 160);

  test("identical images: nothing changed, no offset", () => {
    const stats = compare_images(before, before, 12);
    expect(stats.changed).toBe(0);
    expect(stats.regions).toBe(0);
    expect(stats.alignment).toEqual({ scale: 1, dx: 0, dy: 0 });
  });

  test("a shifted copy with one stamp: one region, the shift found", () => {
    const after = stamp(render(200, 160, 7, -5), 120, 40, 20);
    const stats = compare_images(before, after, 12);
    expect(stats.regions).toBe(1);
    expect(Math.abs(stats.alignment.dx - 7)).toBeLessThan(1);
    expect(Math.abs(stats.alignment.dy + 5)).toBeLessThan(1);
    expect(stats.changed).toBeGreaterThan(0.5);
    expect(stats.changed).toBeLessThan(5);
  });

  test("tolerance_level maps percent onto 0–255", () => {
    expect(tolerance_level(100)).toBe(255);
    expect(tolerance_level(0)).toBe(0);
  });
});
