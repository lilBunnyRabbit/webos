import { describe, expect, it } from "vitest";
import {
  brush_offsets,
  BrushShape,
  ellipse_points,
  flip_horizontal,
  line_points,
  mask_edges,
  match_mask,
  mirror_points,
  normalize_rect,
  Pattern,
  pattern_hit,
  pixel_perfect,
  rect_points,
  rotate_ccw,
  rotate_cw,
  scale_nearest,
} from "./raster";

const key = (points: { x: number; y: number }[]) => points.map((p) => `${p.x},${p.y}`).sort();

describe("line_points", () => {
  it("draws a Bresenham line including both ends", () => {
    expect(line_points({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 3, y: 1 },
    ]);
    expect(line_points({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
  });
});

describe("pixel_perfect", () => {
  it("drops the corner of an L", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ];
    expect(pixel_perfect(path)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it("keeps straight lines and removes repeats", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    expect(pixel_perfect(path)).toHaveLength(3);
  });
});

describe("brushes and patterns", () => {
  it("makes a 3px round brush a plus", () => {
    expect(brush_offsets(3, BrushShape.ROUND)).toHaveLength(5);
    expect(brush_offsets(3, BrushShape.SQUARE)).toHaveLength(9);
    expect(brush_offsets(1, BrushShape.ROUND)).toEqual([{ x: 0, y: 0 }]);
  });

  it("covers a quarter, half and three quarters of a 2×2 cell", () => {
    const count = (pattern: Pattern) => [0, 1].flatMap((y) => [0, 1].map((x) => pattern_hit(pattern, x, y))).filter(Boolean).length;
    expect(count(Pattern.SPARSE)).toBe(1);
    expect(count(Pattern.CHECKER)).toBe(2);
    expect(count(Pattern.DENSE)).toBe(3);
    expect(count(Pattern.SOLID)).toBe(4);
    expect(pattern_hit(Pattern.CHECKER, 0, 0)).not.toBe(pattern_hit(Pattern.CHECKER, 1, 0));
  });

  it("mirrors across both axes", () => {
    expect(key(mirror_points({ x: 1, y: 2 }, 8, 8, true, true))).toEqual(key([
      { x: 1, y: 2 },
      { x: 6, y: 2 },
      { x: 1, y: 5 },
      { x: 6, y: 5 },
    ]));
  });
});

describe("shapes", () => {
  it("normalizes a dragged rectangle inclusive of both corners", () => {
    expect(normalize_rect({ x: 4, y: 3 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 1, width: 4, height: 3 });
    expect(normalize_rect({ x: 0, y: 0 }, { x: 4, y: 1 }, true)).toEqual({ x: 0, y: 0, width: 5, height: 5 });
  });

  it("outlines and fills rectangles", () => {
    expect(rect_points({ x: 0, y: 0, width: 3, height: 3 }, false)).toHaveLength(8);
    expect(rect_points({ x: 0, y: 0, width: 3, height: 3 }, true)).toHaveLength(9);
  });

  it("draws symmetric ellipses at every size", () => {
    for (const size of [1, 2, 3, 4, 5, 8, 11]) {
      const points = ellipse_points({ x: 0, y: 0, width: size, height: size }, false);
      const set = new Set(points.map((p) => `${p.x},${p.y}`));
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(size);
        expect(set.has(`${size - 1 - p.x},${p.y}`)).toBe(true);
        expect(set.has(`${p.x},${size - 1 - p.y}`)).toBe(true);
      }
    }
    const filled = ellipse_points({ x: 0, y: 0, width: 5, height: 5 }, true);
    expect(new Set(filled.map((p) => `${p.x},${p.y}`)).has("2,2")).toBe(true);
  });
});

describe("match_mask", () => {
  const data = Uint8Array.from([1, 1, 2, 1, 2, 2, 1, 2, 1]);

  it("fills only connected pixels of the same index", () => {
    expect(Array.from(match_mask(data, 3, 3, 0, 0, true)!)).toEqual([1, 1, 0, 1, 0, 0, 1, 0, 0]);
  });

  it("matches everywhere when not contiguous", () => {
    expect(Array.from(match_mask(data, 3, 3, 0, 0, false)!)).toEqual([1, 1, 0, 1, 0, 0, 1, 0, 1]);
  });

  it("returns null outside the canvas", () => {
    expect(match_mask(data, 3, 3, 3, 0, true)).toBeNull();
  });
});

describe("buffer transforms", () => {
  const data = Uint8Array.from([1, 2, 3, 4, 5, 6]);

  it("flips and rotates", () => {
    expect(Array.from(flip_horizontal(data, 3, 2))).toEqual([3, 2, 1, 6, 5, 4]);
    expect(Array.from(rotate_cw(data, 3, 2))).toEqual([4, 1, 5, 2, 6, 3]);
    expect(Array.from(rotate_ccw(rotate_cw(data, 3, 2), 2, 3))).toEqual(Array.from(data));
  });

  it("scales by nearest neighbour", () => {
    expect(Array.from(scale_nearest(Uint8Array.from([1, 2]), 2, 1, 4, 2))).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
  });
});

describe("mask_edges", () => {
  it("outlines a block with four merged segments", () => {
    const mask = Uint8Array.from([0, 0, 0, 0, 1, 1, 0, 1, 1]);
    expect(mask_edges(mask, 3, 3)).toEqual([1, 1, 3, 1, 1, 3, 3, 3, 1, 1, 1, 3, 3, 1, 3, 3]);
  });
});
