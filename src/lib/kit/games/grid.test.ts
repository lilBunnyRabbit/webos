import { describe, expect, test } from "vitest";
import { across_cells, down_cells, grid_key_move, stroke_axis, stroke_cells, stroke_end } from "./grid";

describe("grid_key_move", () => {
  test("moves one cell and stops at the edges", () => {
    expect(grid_key_move("ArrowRight", 6, 5, 4)).toBe(7);
    expect(grid_key_move("ArrowDown", 6, 5, 4)).toBe(11);
    expect(grid_key_move("ArrowUp", 2, 5, 4)).toBe(2);
    expect(grid_key_move("ArrowLeft", 5, 5, 4)).toBe(5);
    expect(grid_key_move("ArrowDown", 17, 5, 4)).toBe(17);
  });

  test("Home and End jump along the row; other keys don't move", () => {
    expect(grid_key_move("Home", 8, 5, 4)).toBe(5);
    expect(grid_key_move("End", 6, 5, 4)).toBe(9);
    expect(grid_key_move("a", 6, 5, 4)).toBeNull();
  });
});

describe("strokes", () => {
  test("lock to the shared line, else the longer way", () => {
    expect(stroke_axis(5, 6, 8)).toBe("row");
    expect(stroke_axis(5, 6, 16)).toBe("col");
    expect(stroke_axis(5, 6, 13)).toBe("row");
    expect(stroke_axis(5, 6, 17)).toBe("col");
  });

  test("end at the pointer's projection onto the start's line", () => {
    expect(stroke_end(5, 6, 18, "row")).toBe(8);
    expect(stroke_end(5, 6, 18, "col")).toBe(16);
  });

  test("cover every cell from start to end", () => {
    expect(stroke_cells(5, 0, 3, "row")).toEqual([0, 1, 2, 3]);
    expect(stroke_cells(5, 12, 2, "col")).toEqual([12, 7, 2]);
    expect(stroke_cells(5, 16, 1, "col")).toEqual([16, 11, 6, 1]);
  });
});

describe("edges", () => {
  test("an across edge joins a cell and its right neighbour, row by row", () => {
    expect(across_cells(4, 0)).toEqual([0, 1]);
    expect(across_cells(4, 2)).toEqual([2, 3]);
    expect(across_cells(4, 3)).toEqual([4, 5]);
    expect(across_cells(4, 11)).toEqual([14, 15]);
  });

  test("a down edge joins a cell and the one below it", () => {
    expect(down_cells(4, 0)).toEqual([0, 4]);
    expect(down_cells(4, 11)).toEqual([11, 15]);
  });
});
