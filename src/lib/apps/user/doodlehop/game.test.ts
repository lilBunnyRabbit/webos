import { describe, expect, test } from "vitest";
import { create_rng } from "$lib/core/utils/random";
import {
  describe_guesses,
  GuessesSchema,
  is_better,
  is_hit,
  Outcome,
  pick_words,
  score_of,
  type WordResult,
} from "./game";
import { WORDS } from "./words";

function result(outcome: Outcome, ms: number | null = null): WordResult {
  return { word: "cat", outcome, ms, strokes: [], guesses: [] };
}

describe("words", () => {
  test("are unique, lowercase and enough for many rounds", () => {
    expect(new Set(WORDS).size).toBe(WORDS.length);
    expect(WORDS.length).toBeGreaterThanOrEqual(150);
    expect(WORDS.length).toBeLessThanOrEqual(250);
    for (const word of WORDS) expect(word).toBe(word.toLowerCase().trim());
  });

  test("a round picks six different words, the same for the same seed", () => {
    const words = pick_words(create_rng(7));
    expect(words).toHaveLength(6);
    expect(new Set(words).size).toBe(6);
    expect(pick_words(create_rng(7))).toEqual(words);
  });
});

describe("guesses", () => {
  test("the schema takes up to three words from the list only", () => {
    expect(GuessesSchema.safeParse({ guesses: ["cat", "dog"] }).success).toBe(true);
    expect(GuessesSchema.safeParse({ guesses: [] }).success).toBe(true);
    expect(GuessesSchema.safeParse({ guesses: ["cat", "dog", "cow", "pig"] }).success).toBe(false);
    expect(GuessesSchema.safeParse({ guesses: ["kitten"] }).success).toBe(false);
  });

  test("any of the three hits", () => {
    expect(is_hit(["dog", "cow", "cat"], "cat")).toBe(true);
    expect(is_hit(["dog"], "cat")).toBe(false);
    expect(is_hit([], "cat")).toBe(false);
  });

  test("read out as a sentence", () => {
    expect(describe_guesses([])).toBe("No idea yet.");
    expect(describe_guesses(["cat"])).toBe("I see cat.");
    expect(describe_guesses(["cat", "dog", "cow"])).toBe("I see cat, or dog, or cow.");
  });
});

describe("score", () => {
  test("counts recognised words and sums only their times", () => {
    const score = score_of([
      result(Outcome.RECOGNISED, 4000),
      result(Outcome.MISSED),
      result(Outcome.SKIPPED),
      result(Outcome.RECOGNISED, 9000),
    ]);
    expect(score).toEqual({ recognised: 2, ms: 13000 });
  });

  test("more words beats a faster round; time breaks ties", () => {
    expect(is_better({ recognised: 1, ms: 0 }, null)).toBe(true);
    expect(is_better({ recognised: 3, ms: 50000 }, { recognised: 2, ms: 1000 })).toBe(true);
    expect(is_better({ recognised: 2, ms: 9000 }, { recognised: 2, ms: 10000 })).toBe(true);
    expect(is_better({ recognised: 2, ms: 10000 }, { recognised: 2, ms: 10000 })).toBe(false);
    expect(is_better({ recognised: 1, ms: 100 }, { recognised: 2, ms: 10000 })).toBe(false);
  });
});
