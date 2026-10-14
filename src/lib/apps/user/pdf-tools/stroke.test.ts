import { describe, expect, test } from "vitest";
import {
  DEFAULT_STROKE,
  build_signature,
  orient,
  outline,
  parse_signature_svg,
  polygon_path,
  signature_svg,
  signed_area,
  smooth_points,
  stroke_widths,
  strokes_path,
  type StrokePoint,
} from "./stroke";

function line(from: number, to: number, step: number, ms_per_point: number, pressure: number | null = null): StrokePoint[] {
  const points: StrokePoint[] = [];
  for (let x = from, t = 0; x <= to; x += step, t += ms_per_point) points.push({ x, y: 10, t, pressure });
  return points;
}

describe("smoothing", () => {
  test("keeps the ends and stays within the input's bounds", () => {
    const zigzag: StrokePoint[] = Array.from({ length: 20 }, (_, i) => ({ x: i * 2, y: i % 2 ? 4 : 0, t: i * 8, pressure: null }));
    const smooth = smooth_points(zigzag, 0.6);
    expect(smooth[0]).toEqual(zigzag[0]);
    expect(smooth.at(-1)).toEqual(zigzag.at(-1));
    const inner = smooth.slice(1, -1);
    expect(Math.max(...inner.map((p) => p.y)) - Math.min(...inner.map((p) => p.y))).toBeLessThan(4);
  });

  test("drops points that don't move", () => {
    const still: StrokePoint[] = [0, 0.05, 0.1, 0.15, 5].map((x, t) => ({ x, y: 0, t, pressure: null }));
    expect(smooth_points(still, 0).length).toBeLessThan(still.length);
  });
});

describe("widths", () => {
  test("faster strokes are thinner, all within the limits", () => {
    const slow = stroke_widths(line(0, 40, 1, 10), DEFAULT_STROKE);
    const fast = stroke_widths(line(0, 400, 10, 2), DEFAULT_STROKE);
    const average = (points: { w: number }[]) => points.reduce((sum, p) => sum + p.w, 0) / points.length;
    expect(average(fast)).toBeLessThan(average(slow));
    for (const point of [...slow, ...fast]) {
      expect(point.w).toBeGreaterThanOrEqual(DEFAULT_STROKE.min_width - 1e-9);
      expect(point.w).toBeLessThanOrEqual(DEFAULT_STROKE.max_width + 1e-9);
    }
  });

  test("pen pressure wins over speed", () => {
    const light = stroke_widths(line(0, 40, 1, 10, 0.1), DEFAULT_STROKE).at(-1)!.w;
    const heavy = stroke_widths(line(0, 40, 1, 10, 1), DEFAULT_STROKE).at(-1)!.w;
    expect(heavy).toBeGreaterThan(light);
    expect(heavy).toBeCloseTo(DEFAULT_STROKE.max_width, 1);
  });
});

describe("outline", () => {
  test("a straight stroke is a band of its width with round caps", () => {
    const polygon = outline([
      { x: 0, y: 0, w: 4 },
      { x: 10, y: 0, w: 4 },
    ]);
    const ys = polygon.map((p) => p.y);
    expect(Math.max(...ys)).toBeCloseTo(2);
    expect(Math.min(...ys)).toBeCloseTo(-2);
    const xs = polygon.map((p) => p.x);
    expect(Math.max(...xs)).toBeGreaterThan(10);
    expect(Math.min(...xs)).toBeLessThan(0);
  });

  test("a tap is a dot", () => {
    const dot = outline([{ x: 5, y: 5, w: 4 }]);
    expect(dot.length).toBe(12);
    for (const point of dot) expect(Math.hypot(point.x - 5, point.y - 5)).toBeCloseTo(2);
  });

  test("orient makes every outline wind the same way", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
      { x: 1, y: 0 },
    ];
    expect(signed_area(square)).toBeLessThan(0);
    expect(signed_area(orient(square))).toBeGreaterThan(0);
  });
});

describe("paths", () => {
  test("polygon_path is closed quadratic segments", () => {
    const d = polygon_path([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
    expect(d).toMatch(/^M5 0Q10 0 10 5Q10 10 5 5Q0 0 5 0Z$/);
  });

  test("strokes_path has one subpath per stroke", () => {
    const d = strokes_path([line(0, 20, 2, 8), line(0, 20, 2, 8).map((p) => ({ ...p, y: 30 }))]);
    expect(d.match(/M/g)?.length).toBe(2);
  });
});

describe("signature", () => {
  test("tight bounds at the origin and a standalone svg that parses back", () => {
    const signature = build_signature([line(100, 200, 2, 8), line(100, 200, 2, 8).map((p) => ({ ...p, y: 60 }))])!;
    expect(signature.x).toBe(0);
    expect(signature.width).toBeGreaterThan(100);
    expect(signature.width).toBeLessThan(115);
    expect(signature.height).toBeGreaterThan(50);
    expect(signature.height).toBeLessThan(62);
    const coordinates = signature.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
    expect(Math.min(...coordinates)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...coordinates)).toBeLessThanOrEqual(Math.max(signature.width, signature.height));

    const svg = signature_svg(signature);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain(`viewBox="0 0 ${signature.width} ${signature.height}"`);
    expect(svg.match(/<path/g)?.length).toBe(1);
    expect(parse_signature_svg(svg)).toEqual(signature);
  });

  test("nothing drawn is no signature", () => {
    expect(build_signature([])).toBeNull();
    expect(build_signature([[]])).toBeNull();
  });

  test("parse rejects files without a viewBox or a path", () => {
    expect(parse_signature_svg("<svg><path d='M0 0'/></svg>")).toBeNull();
    expect(parse_signature_svg('<svg viewBox="0 0 10 10"></svg>')).toBeNull();
    expect(parse_signature_svg('<svg viewBox="0,0,10,5"><path fill="#000" d="M0 0L1 1Z"/><path d="M2 2L3 3Z"/></svg>')).toEqual({
      d: "M0 0L1 1Z M2 2L3 3Z",
      x: 0,
      y: 0,
      width: 10,
      height: 5,
    });
  });
});
