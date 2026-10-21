import { create_rng } from "$lib/core/utils/random";
import { describe, expect, it } from "vitest";
import {
  adjacent,
  build_trie,
  carve,
  cells_mask,
  count_covers,
  generate,
  length_sets,
  LEVELS,
  MAX_LENGTH,
  MIN_LENGTH,
  Size,
  traceable,
} from "./puzzle";
import { load_dictionary } from "./words";

describe("length_sets", () => {
  it("splits a board into 3 to 5 words of 5 to 7 letters", () => {
    for (const { rows, cols } of Object.values(LEVELS)) {
      const sets = length_sets(rows * cols);
      expect(sets.length).toBeGreaterThan(0);
      for (const set of sets) {
        expect(set.reduce((sum, length) => sum + length, 0)).toBe(rows * cols);
        expect(set.length).toBeGreaterThanOrEqual(3);
        expect(set.length).toBeLessThanOrEqual(5);
        for (const length of set) expect(length).toBeGreaterThanOrEqual(MIN_LENGTH);
      }
    }
  });
});

describe("carve", () => {
  it("covers every cell once with orthogonal snake paths of the asked lengths", () => {
    const rng = create_rng(7);
    for (let run = 0; run < 50; run++) {
      const paths = carve(5, 5, [7, 6, 6, 6], rng);
      if (!paths) continue;
      expect(paths.map((path) => path.length)).toEqual([7, 6, 6, 6]);
      expect(paths.flat().sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i));
      for (const path of paths) for (let i = 1; i < path.length; i++) expect(adjacent(5, path[i - 1], path[i])).toBe(true);
    }
  });
});

describe("traceable and count_covers", () => {
  const letters = [..."abcdefghij"];
  const trie = build_trie(["abcde", "fghij", "abgfk", "edcba"]);

  it("finds each word once per set of cells, either way it reads", () => {
    const found = traceable(2, 5, letters, trie);
    expect(found.get(cells_mask([0, 1, 2, 3, 4]))).toMatch(/abcde|edcba/);
    expect(found.has(cells_mask([5, 6, 7, 8, 9]))).toBe(true);
    expect(found.size).toBe(2);
  });

  it("counts the ways the board splits into words, stopping at the limit", () => {
    const top = cells_mask([0, 1, 2, 3, 4]);
    const bottom = cells_mask([5, 6, 7, 8, 9]);
    expect(count_covers(2, 5, [top, bottom])).toBe(1);
    const left = cells_mask([0, 1, 5, 6, 7]);
    const right = cells_mask([2, 3, 4, 8, 9]);
    expect(count_covers(2, 5, [top, bottom, left, right])).toBe(2);
    expect(count_covers(2, 5, [top])).toBe(0);
  });
});

describe("generate", () => {
  it.each(Object.values(Size))("makes %s boards whose only split into words is the hidden one", async (size) => {
    const dictionary = await load_dictionary();
    for (let seed = 1; seed <= 15; seed++) {
      const { puzzle } = generate(size, seed * 104729, dictionary);
      const { rows, cols } = LEVELS[size];
      expect(puzzle.letters.length).toBe(rows * cols);
      expect(puzzle.letters.every((letter) => /^[a-z]$/.test(letter))).toBe(true);
      expect(puzzle.tunnels.flatMap((tunnel) => tunnel.cells).sort((a, b) => a - b)).toEqual(
        Array.from({ length: rows * cols }, (_, i) => i)
      );
      for (const tunnel of puzzle.tunnels) {
        expect(tunnel.word.length).toBeLessThanOrEqual(MAX_LENGTH);
        expect(dictionary.answers[tunnel.word.length]).toContain(tunnel.word);
        expect(tunnel.cells.map((cell) => puzzle.letters[cell]).join("")).toBe(tunnel.word);
      }
      expect(count_covers(rows, cols, traceable(rows, cols, puzzle.letters, dictionary.trie).keys())).toBe(1);
    }
  });

  it("is the same puzzle for the same seed", async () => {
    const dictionary = await load_dictionary();
    expect(generate(Size.MEDIUM, 42, dictionary).puzzle).toEqual(generate(Size.MEDIUM, 42, dictionary).puzzle);
  });

  it("stays fast enough to run on the main thread", async () => {
    const dictionary = await load_dictionary();
    const started = performance.now();
    for (let seed = 1; seed <= 50; seed++) generate(Size.LARGE, seed, dictionary);
    expect((performance.now() - started) / 50).toBeLessThan(20);
  });
});
