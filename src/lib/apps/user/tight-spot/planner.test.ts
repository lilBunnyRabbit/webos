import { describe, expect, test } from "vitest";
import {
  collide,
  create_game,
  level_round,
  LEVEL_COUNT,
  Mode,
  obstacles,
  parked_in,
  SCENARIO_INFO,
  spec_of,
  verdict,
  type GameState,
} from "./game";
import { drive, parked_poses, plan, type PlanResult } from "./planner";
import { centroid, type Pose } from "./geometry";
import { jackknifed, type Placement } from "./vehicle";
import { ChunkKind, CHUNK, open_world, SCENARIOS, SIDES, type Side } from "./world";

/**
 * Two proofs. From the start: a search from the car exactly as `create_game` places it (a trailer straight behind)
 * until the game's own judging calls it parked; every node is a placement the moves really reach, so the path is one a
 * driver can drive, reversing a trailer included. Out of the bay: a search from a parked pose to near the start, the
 * same path backwards getting in since a car has no slip; cheaper, and only sound without a trailer, so the seed sweeps
 * of car kinds use it and a trailer, or a fixed level, always goes from the start.
 */
function reachable(state: GameState, from_start: boolean): boolean {
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
    expect(parks(state, found)).toBe(true);
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

const SEEDS = 8;

describe("every generated spot can be reached with the vehicle's turning circle", () => {
  for (const scenario of SCENARIOS) {
    for (const vehicle of SCENARIO_INFO[scenario].vehicles) {
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

  test("every free bay in the open lot, through its lot's gate", { timeout: 120_000 }, () => {
    for (const seed of [42, 7]) {
      const world = open_world(seed);
      const near = obstacles(world);
      const lots = world.chunks.filter((each) => each.kind === ChunkKind.LOT);
      expect(lots).toHaveLength(4);
      for (const lot of lots) {
        const side = SIDES.find((each) => lot.exits[each])!;
        const gate = gate_pose(lot.cx, lot.cy, side);
        expect(
          plan(world.start, gate, near, { heading_tolerance: Math.PI }),
          `gate ${lot.cx},${lot.cy}`
        ).not.toBeNull();
        const bays = lot.bays;
        expect(bays.length).toBeGreaterThan(0);
        for (const bay of bays) {
          const ok = parked_poses(bay, near).some(
            (pose) => plan(pose, gate, near, { heading_tolerance: Math.PI }) !== null
          );
          expect(ok, `bay at ${centroid(bay.shape).x.toFixed(1)},${centroid(bay.shape).y.toFixed(1)}`).toBe(true);
        }
      }
    }
  });
});

function gate_pose(cx: number, cy: number, side: Side): Pose {
  const mid = { x: (cx + 0.5) * CHUNK, y: (cy + 0.5) * CHUNK };
  const out = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } }[side];
  return { x: mid.x + out.x * (CHUNK / 2 + 4), y: mid.y + out.y * (CHUNK / 2 + 4), heading: Math.atan2(out.y, out.x) };
}
