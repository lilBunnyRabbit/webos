import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games";
import { create_game, daily_round, level_round, sailing_round, type Round } from "./game";
import { par_of } from "./plan";
import { prove } from "./prove";

const ROUNDS: [string, Round][] = [
  ["level 1", level_round(1)],
  ["level 4", level_round(4)],
  ["level 8", level_round(8)],
  ["level 12", level_round(12)],
  ["sailing 87109", sailing_round(87109)],
  ["sailing 609763", sailing_round(609763)],
  ["the daily of 2026-10-29", daily_round("2026-10-29", daily_seed("2026-10-29", "tight-spot/ferry"))],
];

describe("sailings can be loaded from the quay, lean and level", () => {
  for (const [name, round] of ROUNDS) {
    // Under 3 s each here; CI runs two to three times slower.
    test(name, { timeout: 60_000 }, () => {
      const { deck } = create_game(round);
      const proof = prove(deck);
      expect(proof.fault).toBeNull();
      expect(par_of(proof.plan!, deck.queue.length).ms % 5000).toBe(0);
    });
  }
});
