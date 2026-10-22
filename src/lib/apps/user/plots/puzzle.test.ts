import { create_rng } from "$lib/core/utils/random";
import { describe, expect, test } from "vitest";
import {
  area_of,
  candidates,
  count_solutions,
  fits,
  generate,
  max_area,
  next_step,
  overlaps,
  partition,
  rect_cells,
  Rule,
  same_rect,
  Shape,
  shape_of,
  solve,
  solves_by_logic,
  span,
  type Clue,
  type Rect,
} from "./puzzle";

function check_partition(size: number, rects: readonly Rect[]) {
  const seen = new Uint8Array(size * size);
  for (const rect of rects)
    for (const cell of rect_cells(rect, size)) {
      expect(seen[cell]).toBe(0);
      seen[cell] = 1;
    }
  expect(seen.every(Boolean)).toBe(true);
}

describe("shapes", () => {
  test("square, tall and wide follow width and height", () => {
    expect(shape_of({ width: 2, height: 2 })).toBe(Shape.SQUARE);
    expect(shape_of({ width: 1, height: 3 })).toBe(Shape.TALL);
    expect(shape_of({ width: 4, height: 2 })).toBe(Shape.WIDE);
  });

  test("a clue fits by area and shape, any shape takes all", () => {
    const clue: Clue = { cell: 0, area: 6, shape: Shape.WIDE };
    expect(fits(clue, { width: 3, height: 2 })).toBe(true);
    expect(fits(clue, { width: 2, height: 3 })).toBe(false);
    expect(fits({ ...clue, area: null }, { width: 5, height: 1 })).toBe(true);
    expect(fits({ ...clue, shape: Shape.ANY }, { width: 2, height: 3 })).toBe(true);
  });

  test("span takes corners in any order", () => {
    expect(span(6, 15, 2)).toEqual({ row: 0, col: 2, width: 2, height: 3 });
    expect(overlaps(span(6, 0, 7), span(6, 7, 14))).toBe(true);
    expect(overlaps(span(6, 0, 7), span(6, 2, 9))).toBe(false);
  });
});

describe("solver", () => {
  test("candidates never hold a second clue", () => {
    const clues: Clue[] = [
      { cell: 0, area: 2, shape: Shape.ANY },
      { cell: 2, area: 2, shape: Shape.ANY },
    ];
    for (const candidate of candidates(3, clues))
      expect(clues.filter((clue) => candidate.cells.includes(clue.cell))).toHaveLength(1);
  });

  test("a 2×2 board of two dominoes has two answers until a shape pins it", () => {
    const clues: Clue[] = [
      { cell: 0, area: 2, shape: Shape.ANY },
      { cell: 3, area: 2, shape: Shape.ANY },
    ];
    expect(count_solutions(2, clues)).toBe(2);
    const pinned = [{ ...clues[0], shape: Shape.WIDE }, clues[1]];
    expect(count_solutions(2, pinned)).toBe(1);
    expect(solve(2, pinned, 1)[0]).toEqual([
      { row: 0, col: 0, width: 2, height: 1 },
      { row: 1, col: 0, width: 2, height: 1 },
    ]);
  });

  test("the rules place a forced plot and say which rule did", () => {
    const clues: Clue[] = [
      { cell: 0, area: 2, shape: Shape.WIDE },
      { cell: 3, area: 2, shape: Shape.ANY },
    ];
    expect(next_step(2, clues, [null, null])).toEqual({ rule: Rule.ONLY_FIT, clue: 0, rect: { row: 0, col: 0, width: 2, height: 1 } });
    expect(solves_by_logic(2, clues)).toBe(true);
  });
});

describe("generate", () => {
  test("partitions cover the board once with plots of 2 to the size's max", () => {
    const rng = create_rng(9);
    for (let tries = 0; tries < 20; tries++) {
      const rects = partition(8, rng);
      if (!rects) continue;
      check_partition(8, rects);
      for (const rect of rects) expect(area_of(rect)).toBeGreaterThanOrEqual(2);
      for (const rect of rects) expect(area_of(rect)).toBeLessThanOrEqual(max_area(8));
    }
  });

  test.each([6, 7, 8, 9])("size %i: one clue per plot, one answer, the rules solve it", (size) => {
    for (const seed of [1, 2, 3, 4]) {
      const puzzle = generate(size, seed);
      check_partition(size, puzzle.solution);
      puzzle.clues.forEach((clue, index) => {
        const rect = puzzle.solution[index];
        expect(rect_cells(rect, size)).toContain(clue.cell);
        expect(fits(clue, rect)).toBe(true);
        expect(clue.area !== null || clue.shape !== Shape.ANY).toBe(true);
      });
      expect(count_solutions(size, puzzle.clues)).toBe(1);
      expect(solves_by_logic(size, puzzle.clues)).toBe(true);
    }
  });

  test("every step on a generated puzzle agrees with its answer", () => {
    for (const seed of [11, 12, 13]) {
      const puzzle = generate(9, seed);
      const placed: (Rect | null)[] = puzzle.clues.map(() => null);
      for (let step = next_step(9, puzzle.clues, placed); step; step = next_step(9, puzzle.clues, placed)) {
        expect(same_rect(step.rect, puzzle.solution[step.clue])).toBe(true);
        placed[step.clue] = step.rect;
      }
      expect(placed.every(Boolean)).toBe(true);
    }
  });

  test("the same seed gives the same puzzle", () => {
    expect(generate(7, 42)).toEqual(generate(7, 42));
    expect(generate(7, 42).clues).not.toEqual(generate(7, 43).clues);
  });

  test("9×9 generates fast enough to run on New puzzle", () => {
    let worst = 0;
    for (let seed = 100; seed < 130; seed++) {
      const start = performance.now();
      generate(9, seed);
      worst = Math.max(worst, performance.now() - start);
    }
    expect(worst).toBeLessThan(400);
  });
});
