import { describe, expect, test } from "vitest";
import { create_game, Mode, SCENARIO_INFO } from "./game";
import { reachable } from "./proof";
import { ChunkKind } from "./world";

// Seed 1 puts the bay on −3 (the straight ramp, then the helix), seed 3 on −2; the tightest difficulty for each.
const SEEDS = [1, 3];

describe("every multi-storey bay can be reached from the street, down the ramps", () => {
  for (const vehicle of SCENARIO_INFO["multi-storey"].vehicles) {
    test(`in a ${vehicle}`, { timeout: 120_000 }, () => {
      for (const seed of SEEDS) {
        const state = create_game({ mode: Mode.SCENARIO, scenario: "multi-storey", difficulty: 1, seed: seed * 7919, vehicle });
        expect(state.world.bays, `seed ${seed}`).toHaveLength(1);
        expect(state.world.chunks.filter((each) => each.kind === ChunkKind.FLOOR).length, `seed ${seed}`).toBe(seed === 1 ? 2 : 1);
        expect(reachable(state, true), `seed ${seed}`).toBe(true);
      }
    });
  }
});
