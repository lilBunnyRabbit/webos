import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games";
import { obstacles } from "../../core/obstacles";
import { drive } from "../../core/planner";
import { jackknifed, type Placement } from "../../core/vehicle";
import { contact, create_game, daily_round, is_done, judge, level_round, push_round, SPEC, type GameState } from "./game";
import { par_of, plan_push } from "./plan";

const PIECE = 0.15;

// The driver's moves again in 15 cm pieces with the real bodies and no margin, judged as a round is.
function prove(state: GameState): string | null {
  const found = plan_push(state);
  if (!found) return "no push found";
  const near = obstacles(state.apron);
  let at: Placement = state.car;
  for (const move of found.moves) {
    const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
    for (let k = 0; k < pieces; k++) {
      at = drive(at, { ...move, distance: move.distance / pieces }, SPEC);
      if (jackknifed(at, SPEC)) return "nose gear past its lock";
      if (contact(near, state.apron, at)) return "touched";
    }
  }
  if (!is_done(judge(state.apron, at))) return "not on the mark";
  if (par_of(found).ms < 30_000) return "par too short";
  return null;
}

describe("every pushback can be done from the tug's start", () => {
  for (const level of [1, 6, 12]) {
    test(`level ${level}`, { timeout: 20_000 }, () => {
      expect(prove(create_game(level_round(level)))).toBeNull();
    });
  }

  test("random pushes", { timeout: 20_000 }, () => {
    for (const seed of [11, 2027]) expect(prove(create_game(push_round(seed))), `seed ${seed}`).toBeNull();
  });

  test("the daily of 2026-10-29", { timeout: 20_000 }, () => {
    const day = "2026-10-29";
    expect(prove(create_game(daily_round(day, daily_seed(day, "tight-spot/airport"))))).toBeNull();
  });
});
