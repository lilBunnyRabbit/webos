import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games";
import { create_game } from "./game";
import { daily_round, job_round, SIZES } from "./levels";
import { prove } from "./prove";

describe("random jobs and the daily can be done from the shunter's start", () => {
  for (const size of SIZES) {
    for (const seed of [11, 2027]) {
      test(`${size} drops, seed ${seed}`, { timeout: 120_000 }, () => {
        const state = create_game(job_round(size, seed * 7919 + size));
        expect(prove(state).fault).toBeNull();
      });
    }
  }

  test("the daily of 2026-11-07", { timeout: 120_000 }, () => {
    const day = "2026-11-07";
    const state = create_game(daily_round(day, daily_seed(day, "tight-spot/shunter")));
    expect(state.yard.tasks).toHaveLength(3);
    expect(prove(state).fault).toBeNull();
  });
});
