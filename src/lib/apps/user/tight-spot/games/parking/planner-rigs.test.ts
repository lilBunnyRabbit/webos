import { describe, expect, test } from "vitest";
import { VEHICLES } from "../../core/vehicle";
import { added, unreached } from "./proof";
import { SCENARIOS } from "./world";

// Each seed is a search from the start with the trailer, several seconds for a long or a twitchy one, so a sample.
const SEEDS = 2;

describe("every generated spot can be reached in the towing rigs added to its kind", () => {
  for (const scenario of SCENARIOS) {
    for (const vehicle of added(scenario).filter((each) => VEHICLES[each].trailer)) {
      for (const difficulty of [0, 0.5, 1]) {
        test(`${scenario} in a ${vehicle} at ${difficulty}`, { timeout: 120_000 }, () => {
          expect(unreached(scenario, vehicle, difficulty, SEEDS)).toEqual([]);
        });
      }
    }
  }
});
