import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games";
import { create_game, daily_round, job_round, SIZES } from "./game";
import { prove } from "./prove";

describe("random jobs and the daily can be done from the forklift's start", () => {
  for (const size of SIZES) {
    for (const seed of [11, 2027]) {
      test(`${size} pallets, seed ${seed}`, { timeout: 60_000 }, () => {
        const state = create_game(job_round(size, seed * 7919 + size));
        expect(prove(state).fault).toBeNull();
      });
    }
  }

  test("the daily of 2026-10-29", { timeout: 60_000 }, () => {
    const day = "2026-10-29";
    const state = create_game(daily_round(day, daily_seed(day, "tight-spot/forklift")));
    expect(state.round.size).toBe(3);
    expect(prove(state).fault).toBeNull();
  });
});
