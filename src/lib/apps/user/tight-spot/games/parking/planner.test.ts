import { describe, expect, test } from "vitest";
import { create_game, level_round, LEVEL_COUNT, Mode, SCENARIO_INFO } from "./game";
import { reachable } from "./proof";
import { SCENARIOS } from "./world";

const SEEDS = 8;

// The vehicles each kind's levels pick from; the ones added since are proven beside it, in planner-vehicles.test.ts.
describe("every generated spot can be reached with the vehicle's turning circle", () => {
  for (const scenario of SCENARIOS) {
    const info = SCENARIO_INFO[scenario];
    for (const vehicle of info.ladder ?? info.vehicles) {
      for (const difficulty of [0, 0.5, 1]) {
        test(`${scenario} in a ${vehicle} at ${difficulty}`, { timeout: 120_000 }, () => {
          for (let seed = 1; seed <= SEEDS; seed++) {
            const state = create_game({ mode: Mode.SCENARIO, scenario, difficulty, seed: seed * 7919, vehicle });
            expect(state.world.bays, `seed ${seed}`).toHaveLength(1);
            expect(reachable(state, false), `seed ${seed}`).toBe(true);
          }
        });
      }
    }
  }

  test("every level", { timeout: 240_000 }, () => {
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      expect(reachable(create_game(level_round(level)), true), `level ${level}`).toBe(true);
    }
  });
});
