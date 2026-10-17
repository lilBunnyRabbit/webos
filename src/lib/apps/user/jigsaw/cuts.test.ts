import { describe, expect, it } from "vitest";
import { cut, grid_for, home, is_edge_piece, piece_counts, piece_path, tab_margin, tab_points, type Edge } from "./cuts";

const numbers = (path: string) => (path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
const points = (path: string) => {
  const list = numbers(path);
  return Array.from({ length: list.length / 2 }, (_, i) => [list[i * 2], list[i * 2 + 1]]);
};

describe("grid_for", () => {
  it("cuts about the asked count into near-square cells", () => {
    const layout = grid_for(48, 1600, 900);
    expect(layout.cols * layout.rows).toBeGreaterThanOrEqual(40);
    expect(layout.cols * layout.rows).toBeLessThanOrEqual(56);
    expect(layout.piece_width / layout.piece_height).toBeGreaterThan(0.75);
    expect(layout.piece_width / layout.piece_height).toBeLessThan(1.33);
  });

  it("keeps at least two cells on each side of a very thin picture", () => {
    const layout = grid_for(24, 1600, 100);
    expect(layout.rows).toBeGreaterThanOrEqual(2);
    expect(layout.cols).toBeGreaterThanOrEqual(2);
  });
});

describe("piece_counts", () => {
  it("offers every count on a roomy board and caps a phone-sized one", () => {
    expect(piece_counts(1200, 800)).toEqual([24, 48, 100, 200]);
    expect(piece_counts(375, 560)).toEqual([24, 48, 100]);
    expect(piece_counts(340, 300)).toEqual([24, 48]);
  });

  it("always offers the smallest count", () => {
    expect(piece_counts(100, 100)).toEqual([24]);
  });
});

describe("cut", () => {
  it("is the same for the same seed and differs for another", () => {
    const layout = grid_for(24, 1200, 800);
    expect(cut(layout, 7)).toEqual(cut(layout, 7));
    expect(cut(layout, 7)).not.toEqual(cut(layout, 8));
  });

  it("has a cut between every pair of neighbouring cells", () => {
    const layout = grid_for(24, 1200, 800);
    const cuts = cut(layout, 1);
    expect(cuts.horizontal).toHaveLength(layout.rows - 1);
    expect(cuts.horizontal.every((row) => row.length === layout.cols)).toBe(true);
    expect(cuts.vertical).toHaveLength(layout.rows);
    expect(cuts.vertical.every((row) => row.length === layout.cols - 1)).toBe(true);
  });
});

describe("tab_points", () => {
  const edge: Edge = { flip: 1, t: 0.1, a: 0, b: 0, c: 0, d: 0, e: 0 };

  it("runs from one corner to the other and bulges along the flipped normal", () => {
    const up = tab_points(edge, { x: 0, y: 0 }, { x: 100, y: 0 });
    const down = tab_points({ ...edge, flip: -1 }, { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(up[0]).toEqual({ x: 0, y: 0 });
    expect(up[9]).toEqual({ x: 100, y: 0 });
    expect(up[4].y).toBeCloseTo(30);
    expect(down[4].y).toBeCloseTo(-30);
  });
});

describe("piece_path", () => {
  const layout = grid_for(24, 1200, 800);
  const cuts = cut(layout, 42);

  it("draws a corner piece's border sides straight", () => {
    const path = piece_path(cuts, 0);
    expect(path.startsWith("M0 0 L")).toBe(true);
    expect(path.endsWith("L0 0 Z")).toBe(true);
    expect(path.match(/C/g)).toHaveLength(6);
  });

  it("gives an inner piece four tabbed sides", () => {
    const inner = layout.cols + 1;
    expect(is_edge_piece(layout, inner)).toBe(false);
    expect(piece_path(cuts, inner).match(/C/g)).toHaveLength(12);
  });

  it("traces a shared cut identically from both neighbours", () => {
    const offset = home(layout, 1).x;
    const right_of_first = points(piece_path(cuts, 0)).slice(2, 11);
    const left_of_second = points(piece_path(cuts, 1)).slice(-9).reverse();
    expect(right_of_first).toHaveLength(9);
    right_of_first.slice(0, 8).forEach(([x, y], i) => {
      expect(x - offset).toBeCloseTo(left_of_second[i + 1][0], 1);
      expect(y).toBeCloseTo(left_of_second[i + 1][1], 1);
    });
  });

  it("keeps every tab inside the margin", () => {
    const margin = tab_margin(layout);
    for (let piece = 0; piece < layout.cols * layout.rows; piece++) {
      const values = numbers(piece_path(cuts, piece));
      values.forEach((value, i) => {
        const limit = i % 2 === 0 ? layout.piece_width : layout.piece_height;
        expect(value).toBeGreaterThanOrEqual(-margin);
        expect(value).toBeLessThanOrEqual(limit + margin);
      });
    }
  });
});
