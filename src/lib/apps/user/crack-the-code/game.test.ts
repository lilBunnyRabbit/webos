import { create_rng } from "$lib/core/utils/random";
import { describe, expect, it } from "vitest";
import {
  best_matches,
  case_number,
  daily_game,
  DAILY_LENGTH,
  declassify,
  empty_stats,
  evaluate_guess,
  generate_secret,
  guess,
  Length,
  new_game,
  record,
  restore,
  saved_schema,
  Status,
  to_saved,
} from "./game";

describe("evaluate_guess", () => {
  it("counts only digits in their right place", () => {
    expect(evaluate_guess([1, 2, 3, 4], [1, 2, 3, 4])).toBe(4);
    expect(evaluate_guess([4, 3, 2, 1], [1, 2, 3, 4])).toBe(0);
    expect(evaluate_guess([1, 3, 2, 4], [1, 2, 3, 4])).toBe(2);
    expect(evaluate_guess([1, 1, 1, 1], [1, 2, 3, 4])).toBe(1);
  });
});

describe("generate_secret", () => {
  it("picks distinct digits, the same for the same seed", () => {
    for (let seed = 0; seed < 50; seed++) {
      const secret = generate_secret(7, create_rng(seed));
      expect(secret).toHaveLength(7);
      expect(new Set(secret).size).toBe(7);
      expect(secret.every((digit) => digit >= 0 && digit <= 9)).toBe(true);
      expect(generate_secret(7, create_rng(seed))).toEqual(secret);
    }
  });
});

describe("case_number", () => {
  it("reads like AB-1234", () => {
    for (let seed = 0; seed < 50; seed++) expect(case_number(create_rng(seed))).toMatch(/^[A-Z]{2}-\d{4}$/);
  });
});

describe("game", () => {
  const game = new_game(Length.L4, 42);

  it("replays the same case from a seed", () => {
    expect(new_game(Length.L4, 42)).toEqual(game);
    expect(game.secret).toHaveLength(4);
  });

  it("logs guesses and cracks on a full match", () => {
    const wrong = [...game.secret].reverse();
    const once = guess(game, wrong);
    expect(once.guesses).toEqual([{ digits: wrong, matches: evaluate_guess(wrong, game.secret) }]);
    expect(once.status).toBe(Status.PLAYING);
    const cracked = guess(once, game.secret);
    expect(cracked.status).toBe(Status.CRACKED);
    expect(best_matches(cracked)).toBe(4);
    expect(guess(cracked, wrong)).toBe(cracked);
  });

  it("ignores a guess of the wrong length", () => {
    expect(guess(game, [1, 2, 3])).toBe(game);
  });

  it("declassifies only a case in play", () => {
    expect(declassify(game).status).toBe(Status.DECLASSIFIED);
    const cracked = guess(game, game.secret);
    expect(declassify(cracked)).toBe(cracked);
  });

  it("gives everyone the same daily", () => {
    const day = daily_game("2026-10-17");
    expect(day.length).toBe(DAILY_LENGTH);
    expect(daily_game("2026-10-17")).toEqual(day);
    expect(daily_game("2026-10-18").secret).not.toEqual(day.secret);
  });
});

describe("saves", () => {
  it("round-trips guesses and a declassified case", () => {
    const game = guess(guess(new_game(Length.L5, 7), [0, 1, 2, 3, 4]), [5, 6, 7, 8, 9]);
    const saved = saved_schema.parse(to_saved(game, 1234));
    expect(restore(saved)).toEqual(game);
    expect(restore(to_saved(declassify(game), 0))?.status).toBe(Status.DECLASSIFIED);
  });

  it("refuses a guess of the wrong length", () => {
    expect(restore({ length: Length.L4, seed: 1, guesses: [[1, 2, 3]], declassified: false, elapsed: 0 })).toBeNull();
  });
});

describe("record", () => {
  it("keeps the fewest guesses and the fastest time apart", () => {
    let stats = record(empty_stats(), Length.L4, 8, 90_000);
    stats = record(stats, Length.L4, 6, 120_000);
    stats = record(stats, Length.L4, 9, 60_000);
    expect(stats[Length.L4]).toEqual({ solved: 3, best: 6, best_ms: 60_000 });
    expect(stats[Length.L5]).toEqual({ solved: 0, best: null, best_ms: null });
  });
});
