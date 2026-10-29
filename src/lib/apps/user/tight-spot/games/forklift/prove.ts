import { describe, expect, test } from "vitest";
import { drive, type Move } from "../../core/planner";
import type { Placement } from "../../core/vehicle";
import {
  can_lift,
  contact,
  create_game,
  fork_fit,
  level_round,
  load_pose,
  near_of,
  offset_of,
  placed_in,
  settle_raised,
  SPEC,
  type GameState,
  type Resting,
} from "./game";
import { par_of, plan_job, racked, type JobPlan } from "./plan";
import type { Slot } from "./warehouse";

const PIECE = 0.15;

export interface Proof {
  plan: JobPlan | null;
  /** Where a replay went wrong, or null when it ran clean. */
  fault: string | null;
}

/**
 * Plans the job from the real start, then drives every leg again in 15 cm pieces with the real bodies and no margin,
 * judged the way a round is: no contact on the way, the forks liftable at each pallet, the pallet inside and straight in
 * its target at each drop. The forks come down for good once they're out of a raised slot, as in a round; a leg's last
 * run into an upper tier is the side view's, raised into that slot. Test-only, like the parking proofs.
 */
export function prove(state: GameState): Proof {
  const found = plan_job(state);
  if (!found) return { plan: null, fault: "no plan" };
  const near = near_of(state.floor);
  let items: Resting[] = state.loads.map((load) => ({ pose: load.pose, tier: load.tier }));
  let at: Placement = { x: state.car.x, y: state.car.y, heading: state.car.heading };
  let raised: Slot | null = null;
  // Drives a leg; false at the first contact.
  const run = (moves: Move[], against: Resting[], offset: Placement | null, upper: Slot | null): boolean => {
    for (let m = 0; m < moves.length; m++) {
      const side = upper && m === moves.length - 1 ? upper : null;
      if (side) raised = side;
      const move = moves[m];
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
      for (let k = 0; k < pieces; k++) {
        at = drive(at, { ...move, distance: move.distance / pieces }, SPEC);
        const load = offset ? load_pose(at, offset) : null;
        if (contact(near, against, at, load, raised)) return false;
        if (!side) raised = settle_raised(raised, at, load);
      }
    }
    return true;
  };
  for (let i = 0; i < state.floor.tasks.length; i++) {
    const task = state.floor.tasks[i];
    const pallet = items[i].pose;
    if (!run(found.legs[i * 2].moves, items, null, task.from.tier > 0 ? task.from : null)) return { plan: found, fault: `pallet ${i + 1}: touched on the way to it` };
    if (!can_lift(fork_fit(at, pallet))) return { plan: found, fault: `pallet ${i + 1}: can't lift` };
    const offset = offset_of(at, pallet);
    const rest = items.filter((_, k) => k !== i);
    if (!run(found.legs[i * 2 + 1].moves, rest, offset, task.to.tier > 0 ? task.to : null)) return { plan: found, fault: `pallet ${i + 1}: touched carrying it` };
    const dropped = load_pose(at, offset);
    if (!placed_in(dropped, task.to)) return { plan: found, fault: `pallet ${i + 1}: not in ${task.to.name}` };
    items = items.map((item, k) => (k === i ? { pose: dropped, tier: task.to.tier } : item));
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
        const par = par_of(proof.plan!, state.round.size, racked(state));
        expect(par.ms).toBeGreaterThan(30_000);
        expect(par.ms % 5000).toBe(0);
      });
    }
  });
}
