import { describe, expect, test } from "vitest";
import type { Point } from "./view";
import { dark_mask, default_quad, homography, project, regions, sample, type Gray, type Quad } from "./perspective";

const close = (a: Point, b: Point, tolerance: number) => Math.hypot(a.x - b.x, a.y - b.y) < tolerance;

const SQUARE: Quad = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];

describe("homography", () => {
  test("maps the four corners exactly", () => {
    const to: Quad = [
      { x: 30, y: 40 },
      { x: 620, y: 20 },
      { x: 680, y: 870 },
      { x: 10, y: 830 },
    ];
    const matrix = homography(SQUARE, to);
    SQUARE.forEach((corner, index) => expect(close(project(matrix, corner), to[index], 1e-6)).toBe(true));
  });

  test("throws on corners that don't form a quadrilateral", () => {
    const line: Quad = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    expect(() => homography(line, SQUARE)).toThrow();
  });
});

describe("sample", () => {
  test("interpolates between pixel centres and clamps at the edges", () => {
    const gray: Gray = { width: 2, height: 1, data: Uint8Array.from([0, 200]) };
    expect(sample(gray, 1, 0.5)).toBe(100);
    expect(sample(gray, -5, 0.5)).toBe(0);
    expect(sample(gray, 9, 0.5)).toBe(200);
  });
});

describe("dark_mask and regions", () => {
  test("finds dark marks on a shaded page as separate regions", () => {
    const width = 120;
    const height = 80;
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = 230 - Math.round((x / width) * 90);
    const ink = (x0: number, y0: number) => {
      for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) data[y * width + x] = 20;
    };
    ink(20, 20);
    ink(90, 50);
    const found = regions(dark_mask({ width, height, data }), width, height);
    expect(found).toHaveLength(2);
    expect(found.map((region) => Math.round(region.cx))).toEqual([24, 94]);
    expect(found.every((region) => region.area === 64 && !region.edge)).toBe(true);
  });
});

test("default_quad sits 8% in from each edge, clockwise from the top left", () => {
  expect(default_quad(100, 200)).toEqual([
    { x: 8, y: 16 },
    { x: 92, y: 16 },
    { x: 92, y: 184 },
    { x: 8, y: 184 },
  ]);
});
