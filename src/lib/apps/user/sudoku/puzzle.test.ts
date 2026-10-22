import { describe, expect, it } from "vitest";
import { create_rng } from "$lib/core/utils/random";
import {
  count_solutions,
  DIFFICULTIES,
  Difficulty,
  full_grid,
  generate,
  grade,
  next_deduction,
  PEERS,
  solve,
  Technique,
  Tier,
} from "./puzzle";
import { SHAPES, Size } from "./puzzle";

const parse = (text: string) => text.split("").map(Number);

const EASY = parse("003020600900305001001806400008102900700000008006708200002609500800203009005010300");
const X_WING = parse("100000569492056108056109240009640801064010000218035604040500016905061402621000005");

function valid_grid(values: readonly number[]): boolean {
  return values.every((value, cell) => value >= 1 && value <= 9 && PEERS[cell].every((peer) => values[peer] !== value));
}

describe("solver", () => {
  it("solves a known puzzle", () => {
    const solution = solve(EASY)!;
    expect(valid_grid(solution)).toBe(true);
    expect(solution.every((value, cell) => !EASY[cell] || EASY[cell] === value)).toBe(true);
  });

  it("counts several solutions and stops at the limit", () => {
    const sparse = [...EASY];
    for (let cell = 0; cell < 40; cell++) sparse[cell] = 0;
    expect(count_solutions(sparse)).toBe(2);
    expect(count_solutions(EASY)).toBe(1);
  });

  it("finds none for contradicting givens", () => {
    const broken = [...EASY];
    broken[0] = 3;
    expect(count_solutions(broken)).toBe(0);
  });

  it("draws valid full grids", () => {
    const rng = create_rng(1);
    for (let i = 0; i < 20; i++) expect(valid_grid(full_grid(rng))).toBe(true);
  });
});

describe("grade", () => {
  it("rates a singles puzzle as singles", () => {
    expect(grade(EASY)).toBe(Tier.SINGLES);
  });

  it("needs an advanced technique for the X-Wing example", () => {
    expect(grade(X_WING, Tier.BASIC)).toBe(Tier.BEYOND);
    expect(grade(X_WING)).toBe(Tier.ADVANCED);
  });

  it("only places correct digits", () => {
    const solution = solve(X_WING)!;
    const values = [...X_WING];
    for (let step = next_deduction(values); step; step = next_deduction(values)) {
      expect(step.digit).toBe(solution[step.cell]);
      values[step.cell] = step.digit;
    }
    expect(values).toEqual(solution);
  });

  it("names the technique that unlocks a placement", () => {
    expect(next_deduction(EASY)?.technique).toBe(Technique.HIDDEN_SINGLE);
  });
});

describe("generate", () => {
  const TIERS = { easy: Tier.SINGLES, medium: Tier.BASIC, hard: Tier.ADVANCED, expert: Tier.BEYOND } as const;

  it.each(DIFFICULTIES)("%s puzzles are unique, consistent and graded", (difficulty) => {
    for (let seed = 1; seed <= 25; seed++) {
      const puzzle = generate(difficulty, seed * 104729);
      expect(count_solutions(puzzle.givens)).toBe(1);
      expect(valid_grid(puzzle.solution)).toBe(true);
      expect(puzzle.givens.every((given, cell) => !given || given === puzzle.solution[cell])).toBe(true);
      expect(puzzle.tier).toBe(grade(puzzle.givens));
      expect(Math.abs(puzzle.tier - TIERS[difficulty])).toBeLessThanOrEqual(1);
      expect(puzzle.givens.every((given, cell) => Boolean(given) === Boolean(puzzle.givens[80 - cell]))).toBe(true);
    }
  });

  it("mostly hits the difficulty's tier exactly", () => {
    for (const difficulty of DIFFICULTIES) {
      const hits = Array.from({ length: 20 }, (_, seed) => generate(difficulty, seed + 1).tier === TIERS[difficulty]);
      expect(hits.filter(Boolean).length).toBeGreaterThanOrEqual(18);
    }
  });

  it("keeps easy puzzles generous and harder ones sparse", () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(generate(Difficulty.EASY, seed).givens.filter(Boolean).length).toBeGreaterThanOrEqual(36);
      expect(generate(Difficulty.HARD, seed).givens.filter(Boolean).length).toBeLessThanOrEqual(32);
    }
  });

  it("is determined by difficulty and seed", () => {
    expect(generate(Difficulty.HARD, 42)).toEqual(generate(Difficulty.HARD, 42));
    expect(generate(Difficulty.HARD, 42).givens).not.toEqual(generate(Difficulty.HARD, 43).givens);
    expect(generate(Difficulty.EASY, 42).givens).not.toEqual(generate(Difficulty.MEDIUM, 42).givens);
  });
});

describe("6×6", () => {
  const SIX = SHAPES[Size.SIX];
  const valid_six = (values: readonly number[]) =>
    values.length === 36 &&
    values.every((value, cell) => value >= 1 && value <= 6 && SIX.peers[cell].every((peer) => values[peer] !== value));

  it("has 2×3 boxes: two rows tall, three columns wide", () => {
    expect([0, 2, 3, 6, 12, 35].map((cell) => SIX.box[cell])).toEqual([0, 0, 1, 0, 2, 5]);
    expect(SIX.units[12]).toEqual([0, 1, 2, 6, 7, 8]);
    expect(SIX.peers[0]).toHaveLength(12);
    expect(SHAPES[Size.NINE].peers).toBe(PEERS);
  });

  it("draws valid full grids", () => {
    const rng = create_rng(3);
    for (let i = 0; i < 50; i++) expect(valid_six(full_grid(rng, Size.SIX))).toBe(true);
  });

  it.each(DIFFICULTIES)("%s puzzles are unique, consistent and symmetric", (difficulty) => {
    for (let seed = 1; seed <= 25; seed++) {
      const puzzle = generate(difficulty, seed * 104729, Size.SIX);
      expect(puzzle.givens).toHaveLength(36);
      expect(count_solutions(puzzle.givens)).toBe(1);
      expect(solve(puzzle.givens)).toEqual(puzzle.solution);
      expect(valid_six(puzzle.solution)).toBe(true);
      expect(puzzle.givens.every((given, cell) => !given || given === puzzle.solution[cell])).toBe(true);
      expect(puzzle.tier).toBe(grade(puzzle.givens));
      expect(puzzle.givens.every((given, cell) => Boolean(given) === Boolean(puzzle.givens[35 - cell]))).toBe(true);
    }
  });

  it("scales the clue counts: easy keeps 16, harder ones fewer", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const easy = generate(Difficulty.EASY, seed, Size.SIX).givens.filter(Boolean).length;
      const medium = generate(Difficulty.MEDIUM, seed, Size.SIX).givens.filter(Boolean).length;
      expect(easy).toBeGreaterThanOrEqual(16);
      expect(medium).toBeLessThan(16);
    }
  });

  it("reaches past singles on hard and expert", () => {
    const tiers = (difficulty: Difficulty) =>
      Array.from({ length: 20 }, (_, seed) => generate(difficulty, seed + 1, Size.SIX).tier);
    expect(tiers(Difficulty.HARD).filter((tier) => tier >= Tier.ADVANCED).length).toBeGreaterThanOrEqual(5);
    expect(tiers(Difficulty.EXPERT).filter((tier) => tier === Tier.BEYOND).length).toBeGreaterThanOrEqual(5);
  });

  it("deduces only correct digits all the way through", () => {
    const puzzle = generate(Difficulty.HARD, 5, Size.SIX);
    const values = [...puzzle.givens];
    for (let step = next_deduction(values); step; step = next_deduction(values)) {
      expect(step.digit).toBe(puzzle.solution[step.cell]);
      values[step.cell] = step.digit;
    }
    expect(values.every(Boolean) || puzzle.tier === Tier.BEYOND).toBe(true);
  });
});
