import { orthogonal } from "$kit/games/path";
import { create_rng } from "$lib/core/utils/random";
import { describe, expect, it } from "vitest";
import { dot_cells, generate, random_path, Side, solutions, walled, type Board } from "./puzzle";

const SIZES = [6, 7, 8];

function is_hamiltonian(size: number, path: readonly number[]): boolean {
  return new Set(path).size === size * size && path.every((cell, i) => i === 0 || orthogonal(size, path[i - 1], cell));
}

function open_board(size: number, dots: Record<number, number>): Board {
  const numbers = new Array<number>(size * size).fill(0);
  for (const [cell, number] of Object.entries(dots)) numbers[Number(cell)] = number;
  return { size, numbers, walls: new Array<number>(size * size).fill(0) };
}

describe("random_path", () => {
  it("visits every cell once, one side-step at a time", () => {
    for (const size of SIZES) {
      for (let seed = 0; seed < 20; seed++) expect(is_hamiltonian(size, random_path(size, create_rng(seed)))).toBe(true);
    }
  });

  it("moves away from the serpentine it starts from", () => {
    const serpentine = [0, 1, 2, 3, 4, 5, 11, 10, 9, 8, 7, 6];
    expect(random_path(6, create_rng(4)).slice(0, 12)).not.toEqual(serpentine);
  });
});

describe("solutions", () => {
  it("counts every path through the dots in order up to the limit", () => {
    const board = open_board(3, { 0: 1, 8: 2 });
    const all = solutions(board, 100);
    expect(all.complete).toBe(true);
    expect(all.answers.length).toBe(2);
    for (const answer of all.answers) expect(is_hamiltonian(3, answer)).toBe(true);
    expect(solutions(board, 1).answers.length).toBe(1);
  });

  it("keeps dots in order", () => {
    const board = open_board(3, { 0: 1, 2: 2, 6: 3, 8: 4 });
    expect(solutions(board, 100).answers).toEqual([[0, 1, 2, 5, 4, 3, 6, 7, 8]]);
  });

  it("never crosses a wall", () => {
    const board = open_board(3, { 0: 1, 8: 2 });
    const walls = [...board.walls];
    walls[1] |= Side.DOWN;
    walls[4] |= Side.UP;
    const answers = solutions({ ...board, walls }, 100).answers;
    expect(answers.length).toBe(1);
    expect(answers[0]).toEqual([0, 1, 2, 5, 4, 3, 6, 7, 8]);
  });

  it("finds nothing when the ends' colours can't be joined", () => {
    expect(solutions(open_board(3, { 0: 1, 1: 2 }), 2).answers).toEqual([]);
    expect(solutions(open_board(4, { 0: 1, 2: 2 }), 2).answers).toEqual([]);
  });

  it("reports an incomplete search when the budget runs out", () => {
    expect(solutions(open_board(6, { 0: 1, 5: 2 }), 1_000_000, 50).complete).toBe(false);
  });
});

describe("generate", () => {
  it("is fully determined by size and seed", () => {
    for (const size of SIZES) expect(generate(size, 31337)).toEqual(generate(size, 31337));
    expect(generate(7, 1)).not.toEqual(generate(7, 2));
  });

  it("dots the answer in order from its first cell to its last, and walls never cross it", () => {
    for (const size of SIZES) {
      for (let seed = 1; seed <= 6; seed++) {
        const puzzle = generate(size, seed);
        const { solution } = puzzle;
        expect(is_hamiltonian(size, solution)).toBe(true);
        const dots = solution.map((cell) => puzzle.numbers[cell]).filter(Boolean);
        expect(dots).toEqual(dots.map((_, i) => i + 1));
        expect(puzzle.numbers[solution[0]]).toBe(1);
        expect(puzzle.numbers[solution[solution.length - 1]]).toBe(dots.length);
        for (let i = 1; i < solution.length; i++) expect(walled(puzzle, solution[i - 1], solution[i])).toBe(false);
      }
    }
  });

  it("has exactly one answer, proven by an unbounded search", () => {
    for (const size of SIZES) {
      for (let seed = 1; seed <= 4; seed++) {
        const puzzle = generate(size, seed * 101);
        const result = solutions(puzzle, 2);
        expect(result.complete).toBe(true);
        expect(result.answers).toEqual([[...puzzle.solution]]);
      }
    }
  });

  it("puts walls on some puzzles and not others", () => {
    const walled_count = Array.from({ length: 20 }, (_, seed) => generate(6, seed)).filter((puzzle) => puzzle.walls.some(Boolean)).length;
    expect(walled_count).toBeGreaterThan(0);
    expect(walled_count).toBeLessThan(20);
  });

  it("keeps fewer dots than cells", () => {
    const puzzle = generate(8, 9);
    expect(dot_cells(puzzle).length).toBeLessThan(32);
  });
});
