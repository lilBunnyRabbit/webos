import { describe, expect, test } from "vitest";
import {
  analyze,
  any_of,
  clue_of,
  differences,
  EMPTY_BIT,
  from_solution,
  generate,
  GENERATED_PALETTE,
  is_settled,
  settled_value,
  solve,
  solve_line,
  Verdict,
  type Clue,
} from "./puzzle";

const U = any_of(1);
const F = 2;
const E = EMPTY_BIT;
const bw = (...lengths: number[]): Clue => lengths.map((length) => ({ length, color: 1 }));
const runs = (...pairs: [number, number][]): Clue => pairs.map(([length, color]) => ({ length, color }));

describe("clue_of", () => {
  test("counts runs", () => {
    expect(clue_of([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual(bw(2, 1, 3));
    expect(clue_of([0, 0])).toEqual([]);
  });

  test("splits touching colours and treats crosses as empty", () => {
    expect(clue_of([1, 1, 2, 0, 2, -1, 2])).toEqual(runs([2, 1], [1, 2], [1, 2], [1, 2]));
  });
});

describe("solve_line, black and white", () => {
  test("overlap fills the middle of a long run", () => {
    expect(solve_line(bw(4), [U, U, U, U, U])).toEqual([U, F, F, F, U]);
  });

  test("an exact fit decides every cell", () => {
    expect(solve_line(bw(2, 2), [U, U, U, U, U])).toEqual([F, F, E, F, F]);
  });

  test("an empty clue empties the line", () => {
    expect(solve_line([], [U, U, U])).toEqual([E, E, E]);
  });

  test("known cells push runs aside", () => {
    expect(solve_line(bw(1), [U, F, U])).toEqual([E, F, E]);
    expect(solve_line(bw(2), [E, U, U, E, U])).toEqual([E, F, F, E, E]);
  });

  test("contradictions return null", () => {
    expect(solve_line(bw(3), [U, E, U, E])).toBeNull();
    expect(solve_line(bw(1), [F, E, F])).toBeNull();
  });
});

describe("solve_line, colour", () => {
  const A = 1 << 1;
  const B = 1 << 2;
  const ALL = any_of(2);

  test("different colours may touch, so they fit without a gap", () => {
    expect(solve_line(runs([2, 1], [2, 2]), [ALL, ALL, ALL, ALL])).toEqual([A, A, B, B]);
  });

  test("the same colour twice still needs a gap", () => {
    expect(solve_line(runs([2, 1], [1, 1]), [ALL, ALL, ALL, ALL])).toEqual([A, A, E, A]);
    expect(solve_line(runs([2, 1], [2, 1]), [ALL, ALL, ALL, ALL])).toBeNull();
  });

  test("a cell keeps only the colours some placement can give it", () => {
    expect(solve_line(runs([1, 1], [1, 2]), [ALL, ALL, ALL])).toEqual([A | E, A | B | E, B | E]);
  });

  test("a known colour rules out runs of another", () => {
    expect(solve_line(runs([1, 2]), [B, ALL, ALL])).toEqual([B, E, E]);
    expect(solve_line(runs([1, 1]), [B, ALL])).toBeNull();
  });
});

describe("generate", () => {
  test.each([5, 10, 15, 20])("%i×%i puzzles are solved by line logic alone, so they're unique", (size) => {
    for (let seed = 1; seed <= 25; seed++) {
      const puzzle = generate(size, size, seed * 7919);
      const solved = solve(size, size, 1, puzzle.rows, puzzle.cols);
      expect(solved).not.toBeNull();
      expect(solved!.every((cell, index) => cell === (puzzle.solution[index] ? F : E))).toBe(true);
    }
  });

  test.each([5, 10, 15, 20])("%i×%i colour puzzles are too, and use every colour", (size) => {
    for (let colors = 2; colors <= 4; colors++) {
      const palette = GENERATED_PALETTE.slice(0, colors);
      for (let seed = 1; seed <= 10; seed++) {
        const puzzle = generate(size, size, seed * 104_729 + colors, palette);
        const solved = solve(size, size, colors, puzzle.rows, puzzle.cols)!;
        expect(solved.every(is_settled)).toBe(true);
        expect(solved.map(settled_value)).toEqual(puzzle.solution);
      }
    }
  });

  test("the seed is the puzzle", () => {
    expect(generate(10, 10, 1234)).toEqual(generate(10, 10, 1234));
    expect(generate(10, 10, 1234).solution).not.toEqual(generate(10, 10, 1235).solution);
    expect(generate(10, 10, 99, GENERATED_PALETTE)).toEqual(generate(10, 10, 99, GENERATED_PALETTE));
  });
});

describe("analyze", () => {
  const verdict_of = (width: number, height: number, cells: number[], colors = 1) => {
    const puzzle = from_solution(0, width, height, GENERATED_PALETTE.slice(0, colors), cells);
    return analyze(width, height, colors, puzzle.rows, puzzle.cols);
  };

  test("a picture logic settles is LOGIC", () => {
    expect(verdict_of(3, 3, [1, 1, 1, 0, 1, 0, 0, 1, 0]).verdict).toBe(Verdict.LOGIC);
  });

  test("a diagonal pair has two answers, and they differ in four cells", () => {
    const result = verdict_of(2, 2, [1, 0, 0, 1]);
    expect(result.verdict).toBe(Verdict.MULTIPLE);
    expect(differences(result.solutions[0], result.solutions[1]).sort()).toEqual([0, 1, 2, 3]);
  });

  test("colour can make the same shape unique", () => {
    expect(verdict_of(2, 2, [1, 0, 0, 2], 2).verdict).toBe(Verdict.LOGIC);
  });

  test("a unique picture logic can't finish needs a guess", () => {
    const cells = [0, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0];
    const result = verdict_of(5, 5, cells);
    expect(result.verdict).toBe(Verdict.UNIQUE);
    expect(result.solutions).toEqual([cells]);
  });

  test("clues no picture meets are NONE", () => {
    expect(analyze(2, 1, 1, [bw(2)], [bw(), bw(1)]).verdict).toBe(Verdict.NONE);
  });

  test("the budget stops a search and says so", () => {
    const empty_rows = Array.from({ length: 6 }, () => bw(1));
    expect(analyze(6, 6, 1, empty_rows, empty_rows, 3).verdict).toBe(Verdict.UNKNOWN);
  });
});
