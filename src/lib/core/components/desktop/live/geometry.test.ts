import { describe, expect, test } from "vitest";
import { centre, dot_cells, Edge, nearest_edge, tile_cells } from "./geometry";

describe("dot_cells", () => {
  test("one cell per grid line crossing, centred on the dot the CSS draws", () => {
    const cells = dot_cells({ x: 16, y: 16, width: 200, height: 100 }, { width: 100, height: 100 }, { columns: 2, rows: 1 });
    expect(cells.map(centre)).toEqual([
      { x: 16, y: 16 },
      { x: 116, y: 16 },
      { x: 216, y: 16 },
      { x: 16, y: 116 },
      { x: 116, y: 116 },
      { x: 216, y: 116 },
    ]);
    expect(cells[0]).toEqual({ x: -34, y: -34, width: 100, height: 100 });
  });

  test("an unmeasured desktop has no cells", () => {
    expect(dot_cells({ x: 0, y: 0, width: 0, height: 0 }, { width: 0, height: 0 }, { columns: 0, rows: 0 })).toEqual([]);
  });
});

test("tile_cells covers the area from its corner", () => {
  const cells = tile_cells({ x: 10, y: 20, width: 30, height: 14 }, 14);
  expect(cells.map(({ x, y }) => [x, y])).toEqual([
    [10, 20],
    [24, 20],
    [38, 20],
  ]);
});

test("nearest_edge names the side a border point sits on", () => {
  const rect = { x: 100, y: 100, width: 200, height: 100 };
  expect(nearest_edge(rect, { x: 150, y: 100 })).toBe(Edge.TOP);
  expect(nearest_edge(rect, { x: 300, y: 150 })).toBe(Edge.RIGHT);
  expect(nearest_edge(rect, { x: 250, y: 200 })).toBe(Edge.BOTTOM);
  expect(nearest_edge(rect, { x: 100, y: 120 })).toBe(Edge.LEFT);
  expect(nearest_edge(rect, { x: 200, y: 195 })).toBe(Edge.BOTTOM);
});
