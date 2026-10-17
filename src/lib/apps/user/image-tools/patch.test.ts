import { describe, expect, test } from "vitest";
import {
  IDENTITY_COLORS,
  Pyramid,
  RestoreMode,
  align,
  apply_colors,
  compare,
  coverage,
  drag_rect,
  find_regions,
  fit_colors,
  halve,
  is_restored,
  ops_bounds,
  rect_at,
  toggle_rect,
  type Alignment,
  type Pixels,
} from "./patch";

interface Blob {
  x: number;
  y: number;
  radius: number;
  color: [number, number, number];
}

function blobs(count: number, width: number, height: number): Blob[] {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  return Array.from({ length: count }, () => ({
    x: random() * width,
    y: random() * height,
    radius: 6 + random() * 24,
    color: [random() * 255, random() * 255, random() * 255],
  }));
}

/** A smooth, non-repeating scene, so any offset other than the true one correlates worse. */
function scene(list: Blob[], x: number, y: number): [number, number, number] {
  const rgb: [number, number, number] = [40, 60, 80];
  for (const blob of list) {
    const weight = Math.exp(-((x - blob.x) ** 2 + (y - blob.y) ** 2) / (blob.radius * blob.radius));
    for (let c = 0; c < 3; c++) rgb[c] += (blob.color[c] - rgb[c]) * weight;
  }
  return rgb;
}

function render(width: number, height: number, color: (x: number, y: number) => [number, number, number]): Pixels {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = color(x + 0.5, y + 0.5);
      const p = (y * width + x) * 4;
      data[p] = r;
      data[p + 1] = g;
      data[p + 2] = b;
      data[p + 3] = 255;
    }
  }
  return { data, width, height };
}

const ORIGINAL_W = 240;
const ORIGINAL_H = 180;
const BLOBS = blobs(40, ORIGINAL_W, ORIGINAL_H);
const original = render(ORIGINAL_W, ORIGINAL_H, (x, y) => scene(BLOBS, x, y));

function transformed(width: number, height: number, a: Alignment, tweak?: (rgb: [number, number, number]) => [number, number, number]): Pixels {
  return render(width, height, (x, y) => {
    const rgb = scene(BLOBS, (x - a.dx) / a.scale, (y - a.dy) / a.scale);
    return tweak ? tweak(rgb) : rgb;
  });
}

function expect_alignment(found: Alignment, expected: Alignment) {
  expect(found.scale).toBeCloseTo(expected.scale, 2);
  expect(Math.abs(found.dx - expected.dx)).toBeLessThan(1);
  expect(Math.abs(found.dy - expected.dy)).toBeLessThan(1);
}

describe("pyramid", () => {
  test("halving averages 2 × 2 blocks and drops an odd edge", () => {
    const data = new Uint8ClampedArray(3 * 2 * 4);
    [0, 100, 200, 40, 60, 0].forEach((value, i) => (data[i * 4] = value));
    const half = halve({ data, width: 3, height: 2 });
    expect([half.width, half.height]).toEqual([1, 1]);
    expect(half.data[0]).toBe(50);
  });

  test("level_for picks the finest level that fits", () => {
    const pyramid = new Pyramid(render(200, 100, () => [0, 0, 0]));
    expect(pyramid.level_for(1000)).toBe(0);
    expect(pyramid.level_for(100)).toBe(1);
    expect(pyramid.level_for(60)).toBe(2);
  });
});

describe("align", () => {
  test("finds a plain shift between same-size images", () => {
    const expected = { scale: 1, dx: 9, dy: -6 };
    const result = align(new Pyramid(original), new Pyramid(transformed(ORIGINAL_W, ORIGINAL_H, expected)));
    expect_alignment(result.alignment, expected);
    expect(result.match).toBeGreaterThan(0.95);
  });

  test("finds a half-size export", () => {
    const expected = { scale: 0.5, dx: 0, dy: 0 };
    const result = align(new Pyramid(original), new Pyramid(transformed(120, 90, expected)));
    expect_alignment(result.alignment, expected);
  });

  test("finds a crop of the original", () => {
    const expected = { scale: 1, dx: -40, dy: -30 };
    const result = align(new Pyramid(original), new Pyramid(transformed(160, 120, expected)));
    expect_alignment(result.alignment, expected);
  });
});

describe("compare and regions", () => {
  const a = { scale: 0.5, dx: 0, dy: 0 };
  const hue = ([r, g, b]: [number, number, number]): [number, number, number] => [g * 0.9 + 10, b, r * 0.8 + 20];
  const stamped = transformed(120, 90, a, hue);
  for (let y = 74; y < 84; y++) {
    for (let x = 90; x < 114; x++) {
      const p = (y * 120 + x) * 4;
      stamped.data[p] = stamped.data[p + 1] = stamped.data[p + 2] = (x + y) % 3 ? 255 : 0;
    }
  }

  test("a global colour change is fitted away, the stamp is the one region", () => {
    const { diff } = compare(new Pyramid(original), new Pyramid(stamped), a, true);
    const regions = find_regions(diff, 40);
    expect(regions).toHaveLength(1);
    const [region] = regions;
    expect(region.x).toBeLessThanOrEqual(90);
    expect(region.y).toBeLessThanOrEqual(74);
    expect(region.x + region.width).toBeGreaterThanOrEqual(114);
    expect(region.y + region.height).toBeGreaterThanOrEqual(84);
  });

  test("without colour matching the whole picture counts as changed", () => {
    const { diff } = compare(new Pyramid(original), new Pyramid(stamped), a, false);
    const [largest] = find_regions(diff, 40).slice(-1);
    expect(largest.width * largest.height).toBeGreaterThan(120 * 90 * 0.5);
  });

  test("regions come smallest first", () => {
    const data = new Uint8Array(40 * 20);
    for (let y = 2; y < 4; y++) for (let x = 2; x < 4; x++) data[y * 40 + x] = 255;
    for (let y = 8; y < 18; y++) for (let x = 20; x < 36; x++) data[y * 40 + x] = 255;
    const regions = find_regions({ data, width: 40, height: 20, factor: 2 }, 10);
    expect(regions.map((r) => [r.x, r.y, r.width, r.height])).toEqual([
      [0, 0, 12, 12],
      [36, 12, 40, 28],
    ]);
  });
});

describe("colours", () => {
  test("fit_colors recovers a linear colour change", () => {
    const n = 200;
    const source = new Float32Array(n * 4);
    const target = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const [r, g, b] = [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256];
      source.set([r, g, b, 255], i * 4);
      target.set([0.5 * g + 20, b, 0.8 * r + 0.1 * g, 255], i * 4);
    }
    const colors = fit_colors(source, target);
    const expected = [0, 0.5, 0, 20, 0, 0, 1, 0, 0.8, 0.1, 0, 0];
    expect(colors.findIndex((value, i) => Math.abs(value - expected[i]) > 0.05)).toBe(-1);
  });

  test("apply_colors maps RGB and keeps alpha", () => {
    const pixels = { data: new Uint8ClampedArray([10, 20, 30, 77]), width: 1, height: 1 };
    apply_colors(pixels, [0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 5]);
    expect(Array.from(pixels.data)).toEqual([20, 30, 15, 77]);
    apply_colors(pixels, IDENTITY_COLORS);
    expect(Array.from(pixels.data)).toEqual([20, 30, 15, 77]);
  });
});

describe("restore ops", () => {
  const rect = { x: 10, y: 10, width: 20, height: 10 };

  test("toggling a region adds then removes its rect", () => {
    const on = toggle_rect([], rect);
    expect(is_restored(on, rect)).toBe(true);
    expect(is_restored(toggle_rect(on, { ...rect }), rect)).toBe(false);
  });

  test("rect_at prefers the smallest box under the point", () => {
    const big = { x: 0, y: 0, width: 100, height: 100 };
    expect(rect_at([big, rect], 15, 15)).toBe(rect);
    expect(rect_at([big, rect], 50, 50)).toBe(big);
    expect(rect_at([rect], 50, 50)).toBeUndefined();
  });

  test("ops_bounds covers adds only, brushes by their radius", () => {
    expect(
      ops_bounds([
        { kind: "rect", mode: RestoreMode.ADD, rect },
        { kind: "brush", mode: RestoreMode.ADD, size: 10, points: [50, 50, 60, 40] },
        { kind: "rect", mode: RestoreMode.ERASE, rect: { x: 0, y: 0, width: 200, height: 200 } },
      ])
    ).toEqual({ x: 10, y: 10, width: 55, height: 45 });
    expect(ops_bounds([])).toBeNull();
  });

  test("drag_rect normalises corners and clamps", () => {
    expect(drag_rect(30.4, 20.6, -5, 8, 25, 100)).toEqual({ x: 0, y: 8, width: 25, height: 13 });
  });

  test("coverage is the overlap of the placed original with the edited frame", () => {
    expect(coverage({ scale: 0.5, dx: -10, dy: 5 }, { width: 100, height: 100 }, { width: 60, height: 60 })).toEqual({
      x: 0,
      y: 5,
      width: 40,
      height: 50,
    });
    expect(coverage({ scale: 1, dx: 500, dy: 0 }, { width: 100, height: 100 }, { width: 60, height: 60 })).toBeNull();
  });
});
