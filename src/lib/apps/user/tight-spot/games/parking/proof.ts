import { collide, obstacles } from "../../core/obstacles";
import { drive, plan, type PlanResult } from "../../core/planner";
import { jackknifed, VEHICLES, type Placement, type Vehicle, type VehicleSpec } from "../../core/vehicle";
import { create_game, Mode, parked_in, SCENARIO_INFO, spec_of, verdict, type GameState } from "./game";
import { parked_poses } from "./poses";
import type { Scenario } from "./world";

/** The vehicles a kind gained after its levels were laid out; a look on a spec already proven there needs no proof. */
export function added(scenario: Scenario): Vehicle[] {
  const info = SCENARIO_INFO[scenario];
  if (!info.ladder) return [];
  const proven = new Set<VehicleSpec>(info.ladder.map((each) => VEHICLES[each]));
  return info.vehicles.filter((each) => {
    if (proven.has(VEHICLES[each])) return false;
    proven.add(VEHICLES[each]);
    return true;
  });
}

/** The seeds of one kind, vehicle and difficulty that don't park: none when the kind is proven there. */
export function unreached(scenario: Scenario, vehicle: Vehicle, difficulty: number, seeds: number): number[] {
  const failed: number[] = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const state = create_game({ mode: Mode.SCENARIO, scenario, difficulty, seed: seed * 7919, vehicle });
    if (state.world.bays.length !== 1 || !reachable(state, false)) failed.push(seed);
  }
  return failed;
}

/**
 * Two proofs. From the start: a search from the car exactly as `create_game` places it (a trailer straight behind)
 * until the game's own judging calls it parked; every node is a placement the moves really reach, so the path is one a
 * driver can drive, reversing a trailer included. Out of the bay: a search from a parked pose to near the start, the
 * same path backwards getting in since a car has no slip; cheaper, and only sound without a trailer, so the seed sweeps
 * of car kinds use it and a trailer, or a fixed level, always goes from the start.
 */
export function reachable(state: GameState, from_start: boolean): boolean {
  const { world, car } = state;
  const spec = spec_of(state.round);
  const near = obstacles(world);
  const bay = world.bays[0];
  const start: Placement = { x: car.x, y: car.y, heading: car.heading, trailer: car.trailer };
  const arrive = (at: Placement) => parked_in(at, bay, spec);
  // A few of the most central poses per way round: the search's coarse closed set can miss with one and not the next.
  const tried = new Map<number, number>();
  return parked_poses(bay, near, 0.05, spec).some((pose) => {
    const count = tried.get(pose.heading) ?? 0;
    if (count >= 3) return false;
    tried.set(pose.heading, count + 1);
    if (!from_start && !spec.trailer) return plan(pose, world.start, near, { spec }) !== null;
    const found = plan(start, pose, near, { spec, arrive });
    if (!found) return false;
    if (!parks(state, found)) throw new Error("the path the search found doesn't park when driven");
    return true;
  });
}

const PIECE = 0.15;

/** Drives the moves from the round's start in the search's own pieces and judges where they end as a round would. */
function parks(state: GameState, found: PlanResult): boolean {
  const spec = spec_of(state.round);
  const near = obstacles(state.world);
  let at: Placement = state.car;
  for (const move of found.moves) {
    const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
    for (let k = 0; k < pieces; k++) {
      at = drive(at, { curvature: move.curvature, distance: move.distance / pieces }, spec);
      if (jackknifed(at) || collide(at, near, spec)) return false;
    }
  }
  return verdict({ ...state, car: { ...state.car, ...at } }) === "inside";
}
