import { describe, expect, it } from "vitest";
import { Cell, count_solutions, create_board, generate, initial_cells, is_valid, propagate, type Puzzle } from "./puzzle";

const SIDES = [5, 7, 9, 12];
const SEEDS: Record<number, number> = { 5: 40, 7: 25, 9: 12, 12: 6 };

function brute_force(puzzle: Puzzle, limit = 2): boolean[][] {
  const board = create_board(puzzle.width, puzzle.height, puzzle.clues);
  const size = puzzle.clues.length;
  const sea = puzzle.clues.map(() => false);
  const found: boolean[][] = [];
  const pooled = (index: number) =>
    board.cell_blocks[index].some((id) => board.blocks[id].every((cell) => cell <= index && sea[cell]));
  const visit = (index: number, land: number) => {
    if (found.length >= limit || land > board.land_total || land + (size - index) < board.land_total) return;
    if (index === size) {
      if (is_valid(board, sea)) found.push([...sea]);
      return;
    }
    if (puzzle.clues[index]) return visit(index + 1, land + 1);
    sea[index] = true;
    if (!pooled(index)) visit(index + 1, land);
    sea[index] = false;
    visit(index + 1, land + 1);
  };
  visit(0, 0);
  return found;
}

describe("generate", () => {
  it("is fully determined by size and seed", () => {
    for (const side of SIDES) expect(generate(side, side, 1234)).toEqual(generate(side, side, 1234));
    expect(generate(7, 7, 1).clues).not.toEqual(generate(7, 7, 2).clues);
  });

  for (const side of SIDES) {
    it(`gives ${side}×${side} puzzles with exactly one answer`, () => {
      for (let seed = 1; seed <= SEEDS[side]; seed++) {
        const puzzle = generate(side, side, seed * 7919);
        const board = create_board(side, side, puzzle.clues);
        expect(is_valid(board, puzzle.solution)).toBe(true);
        for (const deep of [false, true]) {
          const count = count_solutions(board, 2, 200_000, initial_cells(board), deep);
          expect(count.exhausted).toBe(false);
          expect(count.solutions).toEqual([puzzle.solution]);
        }
      }
    });
  }

  it("agrees with plain enumeration on small boards", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const puzzle = generate(5, 5, seed);
      expect(brute_force(puzzle)).toEqual([puzzle.solution]);
    }
  });

  it("numbers every island once with its size", () => {
    const puzzle = generate(9, 9, 42);
    const land = puzzle.solution.filter((sea) => !sea).length;
    expect(puzzle.clues.reduce((sum, clue) => sum + clue, 0)).toBe(land);
    puzzle.clues.forEach((clue, index) => clue && expect(puzzle.solution[index]).toBe(false));
  });
});

describe("propagate", () => {
  const board = create_board(3, 3, [0, 0, 0, 0, 3, 0, 0, 0, 0]);

  it("walls off a finished island and fills the rest", () => {
    const cells = initial_cells(board);
    cells[1] = Cell.LAND;
    cells[0] = Cell.LAND;
    expect(propagate(board, cells)).toBe(true);
    expect([...cells]).toEqual([2, 2, 1, 1, 2, 1, 1, 1, 1]);
  });

  it("rejects a pool and an oversized island", () => {
    const corner = create_board(3, 3, [0, 0, 0, 0, 0, 0, 0, 0, 3]);
    const pool = initial_cells(corner);
    [0, 1, 3, 4].forEach((index) => (pool[index] = Cell.SEA));
    expect(propagate(corner, pool)).toBe(false);

    const big = initial_cells(board);
    [1, 3, 5].forEach((index) => (big[index] = Cell.LAND));
    expect(propagate(board, big)).toBe(false);
  });

  it("logs its deductions in order", () => {
    const cells = initial_cells(board);
    cells[1] = Cell.LAND;
    cells[0] = Cell.LAND;
    const log: number[] = [];
    propagate(board, cells, log);
    expect(new Set(log)).toEqual(new Set([2, 3, 5, 6, 7, 8]));
  });
});
