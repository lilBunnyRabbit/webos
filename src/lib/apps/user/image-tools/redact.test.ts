import { describe, expect, test } from "vitest";
import { RestoreMode, type Pixels } from "./patch";
import { Effect, area_at, blur, pixelate, type RedactArea } from "./redact";

function stripes(width: number, height: number): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      data.fill(x % 2 ? 255 : 0, p, p + 3);
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

const red = (pixels: Pixels, x: number, y: number) => pixels.data[(y * pixels.width + x) * 4];

describe("pixelate", () => {
  test("fills each block with its average", () => {
    const pixels = stripes(24, 12);
    pixelate(pixels, 12);
    expect(red(pixels, 0, 0)).toBe(128);
    expect(red(pixels, 11, 11)).toBe(128);
    expect(red(pixels, 12, 0)).toBe(128);
  });

  test("blocks line up with the whole image's grid, not the region's", () => {
    const pixels = stripes(12, 12);
    for (let y = 0; y < 12; y++) pixels.data.fill(0, y * 48, y * 48 + 24);
    pixelate(pixels, 12, 6, 0);
    expect(red(pixels, 0, 0)).toBe(0);
    expect(red(pixels, 5, 0)).toBe(0);
    expect(red(pixels, 6, 0)).toBe(128);
  });
});

describe("blur", () => {
  test("flattens fine detail", () => {
    const pixels = stripes(80, 80);
    blur(pixels, 20);
    expect(Math.abs(red(pixels, 40, 40) - red(pixels, 41, 40))).toBeLessThanOrEqual(1);
  });

  test("edges repeat instead of fading out", () => {
    const pixels = stripes(40, 40);
    blur(pixels, 20);
    expect(pixels.data[3]).toBe(255);
    expect(red(pixels, 0, 0)).toBeGreaterThan(60);
  });
});

describe("area_at", () => {
  const areas: RedactArea[] = [
    { effect: Effect.BOX, op: { kind: "rect", mode: RestoreMode.ADD, rect: { x: 0, y: 0, width: 100, height: 100 } } },
    { effect: Effect.BLUR, op: { kind: "rect", mode: RestoreMode.ADD, rect: { x: 40, y: 40, width: 10, height: 10 } } },
    { effect: Effect.BOX, op: { kind: "brush", mode: RestoreMode.ERASE, size: 20, points: [45, 45] } },
    { effect: Effect.PIXELATE, op: { kind: "brush", mode: RestoreMode.ADD, size: 10, points: [200, 200, 220, 200] } },
  ];

  test("the smallest area wins and erase strokes are never picked", () => {
    expect(area_at(areas, 45, 45)).toBe(1);
    expect(area_at(areas, 10, 10)).toBe(0);
  });

  test("brush strokes hit by their bounds, reach grows every area", () => {
    expect(area_at(areas, 210, 203)).toBe(3);
    expect(area_at(areas, 210, 208)).toBeNull();
    expect(area_at(areas, 210, 208, 4)).toBe(3);
  });
});
