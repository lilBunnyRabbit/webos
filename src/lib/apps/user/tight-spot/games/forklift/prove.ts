import { describe, expect, test } from "vitest";
import { obstacles } from "../../core/obstacles";
import { drive } from "../../core/planner";
import type { Placement } from "../../core/vehicle";
import { can_lift, contact, create_game, fork_fit, level_round, load_pose, offset_of, placed_in, SPEC, type GameState } from "./game";
import { par_of, plan_job, type JobPlan } from "./plan";

const PIECE = 0.15;

export interface Proof {
  plan: JobPlan | null;
  /** Where a replay went wrong, or null when it ran clean. */
  fault: string | null;
}

/**
 * Plans the job from the real start, then drives every leg again in 15 cm pieces with the real bodies and no margin,
 * judged the way a round is: no contact on the way, the forks liftable at each pallet, the pallet inside and straight in
 * its target at each drop. Test-only, like the parking proofs.
 */
export function prove(state: GameState): Proof {
  const found = plan_job(state);
  if (!found) return { plan: null, fault: "no plan" };
  const near = obstacles(state.floor);
  let poses = state.loads.map((load) => load.pose);
  let at: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading };
  for (let i = 0; i < state.floor.tasks.length; i++) {
    const task = state.floor.tasks[i];
    const pallet = poses[i];
    const fetch = found.legs[i * 2];
    const deliver = found.legs[i * 2 + 1];
    for (const move of fetch.moves) {
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
      for (let k = 0; k < pieces; k++) {
        at = drive(at, { ...move, distance: move.distance / pieces }, SPEC);
        if (contact(near, poses, at, null)) return { plan: found, fault: `pallet ${i + 1}: touched on the way to it` };
      }
    }
    if (!can_lift(fork_fit(at, pallet))) return { plan: found, fault: `pallet ${i + 1}: can't lift` };
    const offset = offset_of(at, pallet);
    const rest = poses.filter((_, k) => k !== i);
    for (const move of deliver.moves) {
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
      for (let k = 0; k < pieces; k++) {
        at = drive(at, { ...move, distance: move.distance / pieces }, SPEC);
        if (contact(near, rest, at, load_pose(at, offset))) return { plan: found, fault: `pallet ${i + 1}: touched carrying it` };
      }
    }
    const dropped = load_pose(at, offset);
    if (!placed_in(dropped, task.to)) return { plan: found, fault: `pallet ${i + 1}: not in ${task.to.name}` };
    poses = poses.map((pose, k) => (k === i ? dropped : pose));
  }
  return { plan: found, fault: null };
}

/** The level proofs, split over two files so the halves run side by side. */
export function prove_levels(from: number, to: number) {
  describe("every warehouse level can be done from the forklift's start", () => {
    for (let level = from; level <= to; level++) {
      // About 5 s for the biggest job here; CI runs two to three times slower.
      test(`level ${level}`, { timeout: 60_000 }, () => {
        const state = create_game(level_round(level));
        const proof = prove(state);
        expect(proof.fault, `level ${level}`).toBeNull();
        const par = par_of(proof.plan!, state.round.size);
        expect(par.ms).toBeGreaterThan(30_000);
        expect(par.ms % 5000).toBe(0);
      });
    }
  });
}
