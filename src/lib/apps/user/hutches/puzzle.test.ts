import { describe, expect, test } from "vitest";
import {
  apply_deduction,
  Cell,
  count_solutions,
  create_board,
  generate,
  next_deduction,
  Rule,
  settle,
  solves_by_logic,
  UnitKind,
} from "./puzzle";

function check_answer(size: number, regions: readonly number[], solution: readonly number[]) {
  expect(new Set(solution).size).toBe(size);
  expect(new Set(solution.map((col, row) => regions[row * size + col])).size).toBe(size);
  solution.forEach((col, row) => row && expect(Math.abs(col - solution[row - 1])).toBeGreaterThan(1));
}

describe("generate", () => {
  test.each([7, 8, 9, 10])("size %i: one answer, meadows connected, the rules solve it", (size) => {
    for (const seed of [1, 2, 3]) {
      const puzzle = generate(size, seed);
      expect(new Set(puzzle.regions).size).toBe(size);
      check_answer(size, puzzle.regions, puzzle.solution);
      expect(count_solutions(size, puzzle.regions)).toBe(1);
      expect(solves_by_logic(create_board(size, puzzle.regions))).toBe(true);
    }
  });

  test("the same seed gives the same puzzle", () => {
    expect(generate(8, 42)).toEqual(generate(8, 42));
    expect(generate(8, 42).regions).not.toEqual(generate(8, 43).regions);
  });
});

describe("deductions", () => {
  const size = 4;
  const regions = [0, 1, 1, 1, 0, 2, 2, 1, 0, 2, 3, 3, 0, 3, 3, 3];

  test("one place left is a rabbit", () => {
    const state = new Int8Array(size * size).fill(Cell.EMPTY);
    state[5] = Cell.UNKNOWN;
    const deduction = next_deduction(create_board(size, regions), state);
    expect(deduction).toMatchObject({ rule: Rule.ONLY, cells: [5], mark: Cell.RABBIT });
  });

  test("a meadow confined to one row empties the rest of that row", () => {
    const state = new Int8Array(size * size);
    state[7] = Cell.EMPTY;
    const deduction = next_deduction(create_board(size, regions), state)!;
    expect(deduction).toMatchObject({ rule: Rule.LOCKED, cells: [0], mark: Cell.EMPTY });
    expect(deduction.units.map((unit) => [unit.kind, unit.index])).toEqual([[UnitKind.MEADOW, 1]]);
    expect(deduction.within.map((unit) => [unit.kind, unit.index])).toEqual([[UnitKind.ROW, 0]]);
  });

  test("every step on a generated puzzle agrees with its answer", () => {
    for (const seed of [5, 6, 7, 8]) {
      const puzzle = generate(9, seed);
      const board = create_board(9, puzzle.regions);
      const state = new Int8Array(81);
      const rabbit = (cell: number) => puzzle.solution[Math.floor(cell / 9)] === cell % 9;
      for (;;) {
        settle(board, state);
        const deduction = next_deduction(board, state);
        if (!deduction) break;
        for (const cell of deduction.cells) {
          expect(state[cell]).toBe(Cell.UNKNOWN);
          expect(rabbit(cell)).toBe(deduction.mark === Cell.RABBIT);
        }
        apply_deduction(state, deduction);
      }
      state.forEach((value, cell) => expect(value === Cell.RABBIT).toBe(rabbit(cell)));
    }
  });
});
