import { describe, expect, test } from "vitest";
import type { Stroke } from "./model";
import { contour_bounds, contours_path, radius_of, rdp, signed_area, stroke_contours } from "./outline";

const line = (x0: number, y0: number, x1: number, y1: number, pressure = 0.5, steps = 20): Stroke =>
  Array.from({ length: steps + 1 }, (_, index) => [x0 + ((x1 - x0) * index) / steps, y0 + ((y1 - y0) * index) / steps, pressure]);

describe("rdp", () => {
  test("drops points on a straight line and keeps a corner", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 5, y: 0.2 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    expect(rdp(points, 1)).toEqual([0, 2, 3]);
  });
});

describe("stroke_contours", () => {
  test("a straight stroke becomes one clockwise contour as wide as the pen", () => {
    const contours = stroke_contours(line(100, 300, 600, 300));
    expect(contours).toHaveLength(1);
    expect(signed_area(contours[0])).toBeLessThan(0);
    const bounds = contour_bounds(contours)!;
    const r = radius_of(0.5);
    expect(Math.abs(bounds.x_min - (100 - r))).toBeLessThan(4);
    expect(Math.abs(bounds.x_max - (600 + r))).toBeLessThan(4);
    expect(Math.abs(bounds.y_min - (300 - r))).toBeLessThan(4);
    expect(Math.abs(bounds.y_max - (300 + r))).toBeLessThan(4);
    expect(contours[0].every((point) => Number.isInteger(point.x) && Number.isInteger(point.y))).toBe(true);
  });

  test("a tap becomes a dot", () => {
    const contours = stroke_contours([[400, 400, 0.5]]);
    expect(contours).toHaveLength(1);
    const bounds = contour_bounds(contours)!;
    expect(bounds.x_max - bounds.x_min).toBeGreaterThan(radius_of(0.5) * 1.8);
  });

  test("more pressure draws a wider line", () => {
    const light = contour_bounds(stroke_contours(line(0, 0, 500, 0, 0.2)))!;
    const heavy = contour_bounds(stroke_contours(line(0, 0, 500, 0, 1)))!;
    expect(heavy.y_max - heavy.y_min).toBeGreaterThan((light.y_max - light.y_min) * 2);
  });

  test("a sharp corner splits into overlapping pieces, all wound the same way", () => {
    const stroke: Stroke = [...line(100, 0, 300, 600), ...line(300, 600, 500, 0).slice(1)];
    const contours = stroke_contours(stroke);
    expect(contours).toHaveLength(2);
    for (const contour of contours) expect(signed_area(contour)).toBeLessThan(0);
  });

  test("a curve keeps one contour", () => {
    const stroke: Stroke = Array.from({ length: 60 }, (_, index) => {
      const angle = (Math.PI * index) / 59;
      return [500 + Math.cos(angle) * 200, 300 + Math.sin(angle) * 200, 0.5];
    });
    const contours = stroke_contours(stroke);
    expect(contours).toHaveLength(1);
    expect(signed_area(contours[0])).toBeLessThan(0);
    expect(contours[0].length).toBeLessThan(60);
  });

  test("simplifies dense input", () => {
    const contours = stroke_contours(line(0, 0, 800, 0, 0.5, 400));
    expect(contours[0].length).toBeLessThan(30);
  });
});

describe("contours_path", () => {
  test("all off-curve points start at an implied midpoint", () => {
    const path = contours_path([
      [
        { x: 0, y: 0, on: false },
        { x: 0, y: 10, on: false },
        { x: 10, y: 10, on: false },
        { x: 10, y: 0, on: false },
      ],
    ]);
    expect(path.startsWith("M5 0")).toBe(true);
    expect(path.match(/Q/g)).toHaveLength(4);
  });

  test("on-curve points are lines", () => {
    const path = contours_path([
      [
        { x: 0, y: 0, on: true },
        { x: 0, y: 10, on: true },
        { x: 10, y: 0, on: true },
      ],
    ]);
    expect(path).toBe("M0 0L0 10L10 0L0 0Z");
  });
});
