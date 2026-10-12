import { describe, expect, test } from "vitest";
import {
  clamp_side,
  ellipse_in,
  fit_zoom,
  line_points,
  parse_hex,
  push_recent,
  rect_from,
  snap_line,
  step_zoom,
  to_canvas_point,
  to_hex,
} from "./shapes";

describe("rect_from", () => {
  test("normalizes a drag in any direction", () => {
    expect(rect_from({ x: 10, y: 10 }, { x: 2, y: 4 })).toEqual({ x: 2, y: 4, width: 8, height: 6 });
  });

  test("square uses the longer side and keeps the drag direction", () => {
    expect(rect_from({ x: 10, y: 10 }, { x: 4, y: 12 }, true)).toEqual({ x: 4, y: 10, width: 6, height: 6 });
  });
});

describe("ellipse_in", () => {
  test("inscribes the ellipse in the rect", () => {
    expect(ellipse_in({ x: 0, y: 0, width: 10, height: 4 })).toEqual({ cx: 5, cy: 2, rx: 5, ry: 2 });
  });
});

describe("snap_line", () => {
  test("snaps to horizontal, vertical and diagonal", () => {
    expect(snap_line({ x: 0, y: 0 }, { x: 10, y: 1 })).toEqual({ x: 10, y: 0 });
    expect(snap_line({ x: 0, y: 0 }, { x: 1, y: -10 })).toEqual({ x: 0, y: -10 });
    expect(snap_line({ x: 0, y: 0 }, { x: 10, y: 9 })).toEqual({ x: 10, y: 10 });
  });
});

describe("line_points", () => {
  test("includes both ends and every step between", () => {
    expect(line_points({ x: 0, y: 0 }, { x: 3, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  test("a steep line has one point per row", () => {
    const points = line_points({ x: 0, y: 0 }, { x: 2, y: 6 });
    expect(points).toHaveLength(7);
    expect(points.at(-1)).toEqual({ x: 2, y: 6 });
  });

  test("a single point", () => {
    expect(line_points({ x: 4.4, y: 1.6 }, { x: 4.4, y: 1.6 })).toEqual([{ x: 4, y: 2 }]);
  });
});

describe("to_canvas_point", () => {
  test("undoes the CSS scale", () => {
    expect(to_canvas_point({ x: 150, y: 70 }, { x: 100, y: 50, width: 200, height: 100 }, 100, 50)).toEqual({ x: 25, y: 10 });
  });
});

describe("zoom", () => {
  test("steps through the levels and stops at the ends", () => {
    expect(step_zoom(1, 1)).toBe(1.5);
    expect(step_zoom(1, -1)).toBe(0.75);
    expect(step_zoom(16, 1)).toBe(16);
    expect(step_zoom(0.125, -1)).toBe(0.125);
    expect(step_zoom(1.2, 1)).toBe(1.5);
  });

  test("fit never zooms past 100%", () => {
    expect(fit_zoom(100, 100, 1000, 1000)).toBe(1);
    expect(fit_zoom(2000, 1000, 1000, 1000)).toBe(0.5);
  });
});

describe("clamp_side", () => {
  test("rounds and clamps", () => {
    expect(clamp_side(0)).toBe(1);
    expect(clamp_side(12.6)).toBe(13);
    expect(clamp_side(99999)).toBe(8192);
    expect(clamp_side(Number.NaN)).toBe(1);
  });
});

describe("colours", () => {
  test("parses and formats hex", () => {
    expect(parse_hex("#ff8000")).toEqual([255, 128, 0, 255]);
    expect(parse_hex("00000080")).toEqual([0, 0, 0, 128]);
    expect(parse_hex("nope")).toEqual([0, 0, 0, 255]);
    expect(to_hex(255, 128, 0)).toBe("#ff8000");
  });

  test("recent colours put the newest first without duplicates", () => {
    expect(push_recent(["#000000", "#ffffff"], "#FFFFFF")).toEqual(["#ffffff", "#000000"]);
    expect(push_recent(["#1", "#2", "#3"], "#4", 3)).toEqual(["#4", "#1", "#2"]);
  });
});
