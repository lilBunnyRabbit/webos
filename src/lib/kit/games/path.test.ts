import { describe, expect, test } from "vitest";
import { grid_walk, orthogonal, path_step, path_walk } from "./path";

const open = (width: number) => (from: number, to: number) => orthogonal(width, from, to);

describe("orthogonal", () => {
  test("shares a side, never across a row's end", () => {
    expect(orthogonal(4, 5, 6)).toBe(true);
    expect(orthogonal(4, 5, 9)).toBe(true);
    expect(orthogonal(4, 3, 4)).toBe(false);
    expect(orthogonal(4, 5, 10)).toBe(false);
  });
});

describe("path_step", () => {
  test("extends to an allowed neighbour of the head", () => {
    expect(path_step([0, 1], 2, open(4))).toEqual([0, 1, 2]);
  });

  test("refuses a cell the rule rejects, returning the same array", () => {
    const path = [0, 1];
    expect(path_step(path, 3, open(4))).toBe(path);
    expect(path_step(path, 5, () => false)).toBe(path);
  });

  test("cuts back to a cell already on the path", () => {
    expect(path_step([0, 1, 2, 6], 2, open(4))).toEqual([0, 1, 2]);
    expect(path_step([0, 1, 2, 6], 0, open(4))).toEqual([0]);
  });

  test("the head itself and an empty path change nothing", () => {
    const path = [0, 1];
    expect(path_step(path, 1, open(4))).toBe(path);
    const empty: number[] = [];
    expect(path_step(empty, 0, open(4))).toBe(empty);
  });
});

describe("grid_walk", () => {
  test("side-steps toward whichever way is further, staying near the straight line", () => {
    expect(grid_walk(4, 0, 2)).toEqual([1, 2]);
    expect(grid_walk(4, 0, 9)).toEqual([4, 5, 9]);
    expect(grid_walk(4, 0, 5)).toEqual([1, 5]);
    expect(grid_walk(4, 0, 5, true)).toEqual([4, 5]);
    expect(grid_walk(4, 5, 5)).toEqual([]);
  });
});

describe("path_walk", () => {
  test("applies each step and stops at the first refusal", () => {
    expect(path_walk([0], [1, 2, 3], open(4))).toEqual([0, 1, 2, 3]);
    expect(path_walk([0], [1, 2, 3], (_, to) => to !== 2)).toEqual([0, 1]);
  });

  test("walking back over the path retracts it", () => {
    expect(path_walk([0, 1, 2, 3], [2, 1], open(4))).toEqual([0, 1]);
  });
});
