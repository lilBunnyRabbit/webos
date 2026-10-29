import { collide, obstacles } from "../../core/obstacles";
import { drive } from "../../core/planner";
import { VEHICLES, type Placement } from "../../core/vehicle";
import { spawn_pose, type Deck } from "./deck";
import { balance, balanced, judge, stowed_solids, type Stowed } from "./game";
import { plan_sailing, type SailingPlan } from "./plan";

const PIECE = 0.15;

export interface Proof {
  plan: SailingPlan | null;
  fault: string | null;
}

/**
 * Plans the sailing from the quay, then drives every leg again in 15 cm pieces with the real bodies and no margin,
 * judged as a round is: no contact on the way, each vehicle stowable where it stops, the load balanced at the end.
 * Test-only, like the Warehouse's proofs.
 */
export function prove(deck: Deck): Proof {
  const found = plan_sailing(deck, (i) => spawn_pose(deck, deck.queue[i]));
  if (!found) return { plan: null, fault: "no plan" };
  let stowed: Stowed[] = [];
  for (let i = 0; i < deck.queue.length; i++) {
    const vehicle = deck.queue[i];
    const spec = VEHICLES[vehicle];
    const near = obstacles({ solids: [...deck.solids, ...stowed.flatMap((each) => each.solids)] });
    let at: Placement = spawn_pose(deck, vehicle);
    for (const move of found.legs[i].moves) {
      const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
      for (let k = 0; k < pieces; k++) {
        at = drive(at, { ...move, distance: move.distance / pieces }, spec);
        if (collide(at, near, spec)) return { plan: found, fault: `${vehicle} ${i + 1}: touched on the way` };
      }
    }
    const verdict = judge(deck, stowed, at, spec);
    if (verdict.fault) return { plan: found, fault: `${vehicle} ${i + 1}: ${verdict.fault}` };
    stowed = [...stowed, { vehicle, car: at, lane: verdict.lane, gap: verdict.gap, solids: stowed_solids(vehicle, at, i) }];
  }
  if (!balanced(balance(deck, stowed))) return { plan: found, fault: "out of balance" };
  return { plan: found, fault: null };
}
