import { describe, expect, it } from "vitest";
import { combos, count_solutions, deduce, from_solution, generate, runs_of } from "./puzzle";

const SIDES = [6, 8, 10, 12];

describe("combos", () => {
  it("lists the digit sets for a sum", () => {
    expect(combos(2, 3)).toEqual([0b11]);
    expect(combos(2, 17)).toEqual([0b110000000]);
    expect(combos(3, 24)).toEqual([0b111000000]);
    expect(combos(2, 10)).toHaveLength(4);
    expect(combos(2, 19)).toEqual([]);
  });
});

describe("runs_of", () => {
  it("finds across and down runs with their clue cells", () => {
    // # # #
    // # . .
    // # . .
    const white = [false, false, false, false, true, true, false, true, true];
    const runs = runs_of(3, white);
    expect(runs.map((run) => [run.across, run.clue, run.cells])).toEqual([
      [true, 3, [4, 5]],
      [true, 6, [7, 8]],
      [false, 1, [4, 7]],
      [false, 2, [5, 8]],
    ]);
  });
});

describe("generate", () => {
  for (const side of SIDES) {
    it(`gives exactly one solution at ${side}×${side}`, () => {
      for (let seed = 1; seed <= 25; seed++) {
        const puzzle = generate(side, seed * 104729);
        const count = count_solutions(puzzle, 2, 1e6);
        expect(count.aborted).toBe(false);
        expect(count.count).toBe(1);
        expect(count.solutions[0]).toEqual(puzzle.solution);
      }
    });
  }

  it("keeps the rules of a kakuro grid", () => {
    for (const side of SIDES) {
      const puzzle = generate(side, 7);
      for (let i = 0; i < side; i++) {
        expect(puzzle.solution[i]).toBe(0);
        expect(puzzle.solution[i * side]).toBe(0);
      }
      for (const run of puzzle.runs) {
        expect(run.cells.length).toBeGreaterThanOrEqual(2);
        expect(run.cells.length).toBeLessThanOrEqual(9);
        const digits = run.cells.map((cell) => puzzle.solution[cell]);
        expect(new Set(digits).size).toBe(digits.length);
        expect(digits.reduce((a, b) => a + b, 0)).toBe(run.sum);
      }
      const n = side * side;
      for (let cell = 0; cell < n; cell++) {
        const mirror = (side - Math.floor(cell / side)) * side + (side - (cell % side));
        if (cell >= side && cell % side) expect(puzzle.solution[cell] > 0).toBe(puzzle.solution[mirror] > 0);
      }
    }
  });

  it("is determined by size and seed", () => {
    expect(generate(10, 42)).toEqual(generate(10, 42));
    expect(generate(10, 42).solution).not.toEqual(generate(10, 43).solution);
  });

  it("stays fast at the largest size", () => {
    const times: number[] = [];
    for (let seed = 1; seed <= 30; seed++) {
      const start = performance.now();
      generate(12, seed);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[15]).toBeLessThan(150);
    expect(times[29]).toBeLessThan(1200);
  });
});

describe("deduce", () => {
  it("can finish every generated puzzle one step at a time", () => {
    for (const side of SIDES) {
      const puzzle = generate(side, 99);
      const values = puzzle.solution.map(() => 0);
      for (;;) {
        const next = deduce(puzzle, values);
        if (!next) break;
        expect(next.digit).toBe(puzzle.solution[next.cell]);
        values[next.cell] = next.digit;
      }
      expect(values).toEqual(puzzle.solution);
    }
  });

  it("reads clues from the solution", () => {
    const puzzle = from_solution(0, 3, [0, 0, 0, 0, 1, 2, 0, 3, 4]);
    expect(puzzle.runs.map((run) => run.sum)).toEqual([3, 7, 4, 6]);
  });
});
