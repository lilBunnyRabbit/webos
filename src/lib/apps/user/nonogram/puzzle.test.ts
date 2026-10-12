import { describe, expect, test } from "vitest";
import { clue_of, generate, Known, solve, solve_line } from "./puzzle";

const { UNKNOWN: U, FILLED: F, EMPTY: E } = Known;

describe("clue_of", () => {
  test("counts runs", () => {
    expect(clue_of([true, true, false, true, false, false, true, true, true])).toEqual([2, 1, 3]);
    expect(clue_of([false, false])).toEqual([]);
  });
});

describe("solve_line", () => {
  test("overlap fills the middle of a long run", () => {
    expect(solve_line([4], [U, U, U, U, U])).toEqual([U, F, F, F, U]);
  });

  test("an exact fit decides every cell", () => {
    expect(solve_line([2, 2], [U, U, U, U, U])).toEqual([F, F, E, F, F]);
  });

  test("an empty clue empties the line", () => {
    expect(solve_line([], [U, U, U])).toEqual([E, E, E]);
  });

  test("known cells push runs aside", () => {
    expect(solve_line([1], [U, F, U])).toEqual([E, F, E]);
    expect(solve_line([2], [E, U, U, E, U])).toEqual([E, F, F, E, E]);
  });

  test("contradictions return null", () => {
    expect(solve_line([3], [U, E, U, E])).toBeNull();
    expect(solve_line([1], [F, E, F])).toBeNull();
  });
});

describe("generate", () => {
  test.each([5, 10, 15, 20])("%i×%i puzzles are solved by line logic alone, so they're unique", (size) => {
    for (let seed = 1; seed <= 25; seed++) {
      const puzzle = generate(size, size, seed * 7919);
      const solved = solve(size, size, puzzle.rows, puzzle.cols);
      expect(solved).not.toBeNull();
      expect(solved!.every((cell, index) => cell === (puzzle.solution[index] ? F : E))).toBe(true);
    }
  });

  test("the seed is the puzzle", () => {
    expect(generate(10, 10, 1234)).toEqual(generate(10, 10, 1234));
    expect(generate(10, 10, 1234).solution).not.toEqual(generate(10, 10, 1235).solution);
  });
});
