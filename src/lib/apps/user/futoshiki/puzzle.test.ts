import { describe, expect, it } from "vitest";
import { create_rng } from "$lib/core/utils/random";
import {
  across_cells,
  count_solutions,
  deduce,
  down_cells,
  generate,
  latin_square,
  logic_solves,
  next_deduction,
  Relation,
  single,
  units_of,
  type Clues,
} from "./puzzle";

const SIZES = [4, 5, 6, 7];

function is_latin(grid: readonly number[], size: number): boolean {
  return units_of(size).every((unit) => new Set(unit.map((index) => grid[index])).size === size);
}

describe("latin_square", () => {
  it("holds every digit once per row and column", () => {
    for (const size of SIZES) {
      for (let seed = 0; seed < 20; seed++) {
        const grid = latin_square(size, create_rng(seed));
        expect(grid.every((digit) => digit >= 1 && digit <= size)).toBe(true);
        expect(is_latin(grid, size)).toBe(true);
      }
    }
  });
});

describe("generate", () => {
  it("is fully determined by size and seed", () => {
    for (const size of SIZES) expect(generate(size, 31337)).toEqual(generate(size, 31337));
    expect(generate(6, 1)).not.toEqual(generate(6, 2));
  });

  it("gives puzzles with exactly one solution, matching the stored one and every clue", () => {
    for (const size of SIZES) {
      for (let seed = 1; seed <= 60; seed++) {
        const puzzle = generate(size, seed * 2654435761);
        expect(is_latin(puzzle.solution, size)).toBe(true);
        expect(count_solutions(puzzle)).toBe(1);
        expect(logic_solves(puzzle)).toBe(true);
        expect(Array.from(deduce(puzzle)!, (mask) => 31 - Math.clz32(mask))).toEqual(puzzle.solution);
        puzzle.givens.forEach((given, index) => given && expect(given).toBe(puzzle.solution[index]));
        const holds = (relation: Relation, [a, b]: [number, number]) =>
          relation === Relation.NONE || (relation === Relation.LESS) === puzzle.solution[a] < puzzle.solution[b];
        puzzle.across.forEach((relation, index) => expect(holds(relation, across_cells(size, index))).toBe(true));
        puzzle.down.forEach((relation, index) => expect(holds(relation, down_cells(size, index))).toBe(true));
      }
    }
  });

  it("is minimal: taking away any clue makes deduction stall", () => {
    for (const size of SIZES) {
      const puzzle = generate(size, 99 + size);
      const variants: Clues[] = [];
      puzzle.givens.forEach((given, index) => {
        if (given) variants.push({ ...puzzle, givens: puzzle.givens.map((g, i) => (i === index ? 0 : g)) });
      });
      for (const axis of ["across", "down"] as const) {
        puzzle[axis].forEach((relation, index) => {
          if (relation) variants.push({ ...puzzle, [axis]: puzzle[axis].map((r, i) => (i === index ? Relation.NONE : r)) });
        });
      }
      for (const variant of variants) expect(logic_solves(variant)).toBe(false);
    }
  });

  it("leans on signs rather than given digits", () => {
    for (const size of SIZES) {
      let givens = 0;
      for (let seed = 0; seed < 30; seed++) givens += generate(size, seed).givens.filter(Boolean).length;
      expect(givens / 30).toBeLessThan(size / 2);
    }
  });

  it("is fast enough for the main thread", () => {
    const times: number[] = [];
    for (let seed = 0; seed < 40; seed++) {
      const start = performance.now();
      generate(7, seed);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[20]).toBeLessThan(150);
    expect(times[times.length - 1]).toBeLessThan(600);
  });
});

describe("count_solutions", () => {
  it("counts an empty grid as many and stops at the limit", () => {
    const empty: Clues = { size: 4, givens: new Array(16).fill(0), across: new Array(12).fill(0), down: new Array(12).fill(0) };
    expect(count_solutions(empty)).toBe(2);
    expect(count_solutions(empty, 5)).toBe(5);
  });

  it("finds none when the signs contradict", () => {
    const across = new Array(12).fill(Relation.NONE);
    across[0] = Relation.LESS;
    const givens = new Array(16).fill(0);
    givens[0] = 4;
    expect(count_solutions({ size: 4, givens, across, down: new Array(12).fill(0) })).toBe(0);
  });
});

describe("next_deduction", () => {
  it("returns a cell deduction pins down, and its digit is the solution's", () => {
    for (const size of SIZES) {
      const puzzle = generate(size, 5);
      const step = next_deduction(puzzle, puzzle.givens);
      expect(step).not.toBeNull();
      expect(puzzle.givens[step!.index]).toBe(0);
      expect(step!.digit).toBe(puzzle.solution[step!.index]);
    }
  });

  it("returns null when the entries contradict the clues", () => {
    const puzzle = generate(4, 8);
    const entries = [...puzzle.givens];
    entries[0] = puzzle.solution[0];
    entries[1] = puzzle.solution[0];
    expect(next_deduction(puzzle, entries)).toBeNull();
  });
});

describe("single", () => {
  it("is true for exactly one candidate", () => {
    expect(single(1 << 3)).toBe(true);
    expect(single((1 << 3) | (1 << 1))).toBe(false);
    expect(single(0)).toBe(false);
  });
});
