import { describe, expect, it } from "vitest";
import { Difficulty, generate, LEVELS, line_cells, occurrences, placement_cells, reverse } from "./puzzle";
import { BLOCKED, THEMES } from "./words";

const DIFFICULTIES = Object.values(Difficulty);

describe("word lists", () => {
  it("has at least eight themes of about forty clean words", () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(8);
    for (const theme of THEMES) {
      expect(theme.words.length, theme.name).toBeGreaterThanOrEqual(38);
      expect(new Set(theme.words).size, theme.name).toBe(theme.words.length);
      for (const word of theme.words) expect(word, theme.name).toMatch(/^[A-Z]{3,10}$/);
    }
  });
});

describe("generate", () => {
  it("is fully determined by difficulty and seed", () => {
    for (const difficulty of DIFFICULTIES) {
      expect(generate(difficulty, 1234)).toEqual(generate(difficulty, 1234));
    }
    expect(generate(Difficulty.HARD, 1).letters).not.toEqual(generate(Difficulty.HARD, 2).letters);
  });

  for (const difficulty of DIFFICULTIES) {
    it(`gives ${difficulty} puzzles where every word reads exactly once`, () => {
      const level = LEVELS[difficulty];
      for (let seed = 0; seed < 150; seed++) {
        const puzzle = generate(difficulty, seed * 7919 + 13);
        expect(puzzle.size).toBe(level.size);
        expect(puzzle.letters).toHaveLength(level.size * level.size);
        expect(puzzle.letters.every((letter) => /^[A-Z]$/.test(letter))).toBe(true);
        expect(puzzle.placements).toHaveLength(level.words);

        const words = puzzle.placements.map((placement) => placement.word);
        for (const placement of puzzle.placements) {
          const { word } = placement;
          expect(word).not.toBe(reverse(word));
          for (const other of words) {
            if (other === word) continue;
            expect(other.includes(word) || other.includes(reverse(word))).toBe(false);
          }
          expect(level.directions).toContainEqual({ dr: placement.dr, dc: placement.dc });
          const cells = placement_cells(puzzle.size, placement);
          expect(cells.map((cell) => puzzle.letters[cell]).join("")).toBe(word);
          expect(occurrences(puzzle.letters, puzzle.size, word)).toHaveLength(1);
        }
      }
    });
  }

  it("keeps blocked words out of the filler", () => {
    for (let seed = 0; seed < 100; seed++) {
      const puzzle = generate(Difficulty.HARD, seed);
      const placed = new Set(puzzle.placements.flatMap((placement) => placement_cells(puzzle.size, placement)));
      for (const word of BLOCKED) {
        for (const hit of occurrences(puzzle.letters, puzzle.size, word)) {
          expect(placement_cells(puzzle.size, hit).every((cell) => placed.has(cell))).toBe(true);
        }
      }
    }
  });

  it("uses every direction on hard", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      for (const { dr, dc } of generate(Difficulty.HARD, seed).placements) seen.add(`${dr},${dc}`);
    }
    expect(seen.size).toBe(8);
  });

  it("stays fast on the largest grid", () => {
    const times: number[] = [];
    for (let seed = 0; seed < 60; seed++) {
      const start = performance.now();
      generate(Difficulty.HARD, seed * 31 + 5);
      times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    expect(times[Math.floor(times.length / 2)]).toBeLessThan(150);
    expect(times[times.length - 1]).toBeLessThan(600);
  });
});

describe("line_cells", () => {
  it("walks a line and refuses to leave the grid", () => {
    expect(line_cells(5, 0, 0, 1, 1, 3)).toEqual([0, 6, 12]);
    expect(line_cells(5, 0, 4, 0, 1, 2)).toBeNull();
    expect(line_cells(5, 4, 0, -1, 1, 5)).toEqual([20, 16, 12, 8, 4]);
  });
});
