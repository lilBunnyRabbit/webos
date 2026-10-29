import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games";
import { obstacles } from "../../core/obstacles";
import { drive, type Move } from "../../core/planner";
import { jackknifed, type Placement, type VehicleSpec } from "../../core/vehicle";
import {
  contact,
  create_game,
  daily_round,
  is_done,
  Job,
  judge,
  level_round,
  phase_done,
  random_round,
  SPEC,
  swap_to_push,
  TOW,
  type GameState,
} from "./game";
import { job_par, par_of, plan_bags, plan_push, plan_tow } from "./plan";

const PIECE = 0.15;

// The driver's moves again in 15 cm pieces with the real bodies and no margin, judged as a round is.
function replay(state: GameState, moves: Move[], spec: VehicleSpec): string | null {
  const near = obstacles(state.scene);
  let at: Placement = state.car;
  for (const move of moves) {
    const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
    for (let k = 0; k < pieces; k++) {
      at = drive(at, { ...move, distance: move.distance / pieces }, spec);
      if (jackknifed(at, spec)) return "folded past the lock";
      if (contact(near, state.apron, at, 0, spec)) return "touched";
    }
  }
  return is_done(judge(state.apron, at, spec)) ? null : "not on the mark";
}

function prove_push(state: GameState): string | null {
  const found = plan_push(state);
  if (!found) return "no push found";
  if (par_of(found).ms < 30_000) return "par too short";
  return replay(state, found.moves, SPEC);
}

// The baggage driver steps with the real bodies and no margin already, so its run is the proof.
function prove_bags(state: GameState): string | null {
  const found = plan_bags(state);
  if (!found) return "no baggage run found";
  return phase_done(state, found.end) ? null : "not on the mark";
}

describe("every pushback can be done from the tug's start", () => {
  for (const level of [1, 6, 12]) {
    test(`level ${level}`, { timeout: 20_000 }, () => {
      expect(prove_push(create_game(level_round(level)))).toBeNull();
    });
  }

  test("random pushes", { timeout: 20_000 }, () => {
    for (const seed of [11, 2027]) expect(prove_push(create_game(random_round(seed))), `seed ${seed}`).toBeNull();
  });
});

describe("every baggage run can be driven forward", () => {
  test("levels 1 and 8, a random run", { timeout: 20_000 }, () => {
    for (const round of [level_round(1, Job.BAGGAGE), level_round(8, Job.BAGGAGE), random_round(31, Job.BAGGAGE)]) {
      expect(prove_bags(create_game(round)), `seed ${round.seed}`).toBeNull();
    }
  });
});

describe("every tow reaches its gate", () => {
  test("levels 1 and 8, a random tow", { timeout: 20_000 }, () => {
    for (const round of [level_round(1, Job.TOW), level_round(8, Job.TOW), random_round(31, Job.TOW)]) {
      const state = create_game(round);
      const found = plan_tow(state);
      expect(found, `seed ${round.seed}`).not.toBeNull();
      expect(replay(state, found!.moves, TOW), `seed ${round.seed}`).toBeNull();
    }
  });
});

describe("every turnaround can be done", () => {
  test("level 8 and the daily of 2026-10-29", { timeout: 20_000 }, () => {
    const day = "2026-10-29";
    for (const round of [level_round(8, Job.TURNAROUND), daily_round(day, daily_seed(day, "tight-spot/airport"))]) {
      const state = create_game(round);
      expect(prove_bags(state), `seed ${round.seed}`).toBeNull();
      expect(prove_push(swap_to_push(state)), `seed ${round.seed}`).toBeNull();
      expect(job_par(state)).not.toBeNull();
    }
  });
});
