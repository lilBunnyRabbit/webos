import { describe, expect, test } from "vitest";
import { collide, level_round, LEVEL_COUNT, obstacles, parked_in, SCENARIO_INFO, spec_of } from "./game";
import { parked_poses, plan, replay } from "./planner";
import { angle_between, centroid, type Pose } from "./geometry";
import { jackknifed, trailer_pose, VEHICLES, type Placement, type VehicleSpec } from "./vehicle";
import {
  ChunkKind,
  CHUNK,
  open_world,
  SCENARIOS,
  scenario_world,
  SIDES,
  type Bay,
  type Side,
  type World,
} from "./world";

const ONE_DEGREE = Math.PI / 180;

/**
 * Plans from the parked pose out to the start: the model has no slip, so the same path driven backwards gets in.
 * Towing, the reverse is the unstable direction, so the path is driven backwards for real and must land in the bay.
 */
function reachable(world: World, bay: Bay, spec: VehicleSpec): boolean {
  const near = obstacles(world);
  const poses = parked_poses(bay, near, 0.05, spec);
  // A few of the most central poses per way round: the search's coarse closed set can miss from one and not the next.
  const tried = new Map<number, number>();
  return poses.some((pose) => {
    const count = tried.get(pose.heading) ?? 0;
    if (count >= 3) return false;
    tried.set(pose.heading, count + 1);
    const found = plan(pose, world.start, near, { spec });
    if (!found) return false;
    if (spec.trailer) expect_replay_lands(pose, found.moves.length ? replay(found, spec) : [pose], bay, world, spec);
    return true;
  });
}

function expect_replay_lands(parked: Placement, placements: Placement[], bay: Bay, world: World, spec: VehicleSpec) {
  const near = obstacles(world);
  for (const at of placements) {
    expect(jackknifed(at)).toBe(false);
    expect(collide(at, near, spec)).toBeNull();
  }
  const end = placements[placements.length - 1];
  expect(Math.hypot(end.x - parked.x, end.y - parked.y)).toBeLessThan(0.05);
  expect(angle_between(end.heading, parked.heading)).toBeLessThan(ONE_DEGREE);
  const trailer = trailer_pose(end, spec.trailer!);
  const wanted = trailer_pose(parked, spec.trailer!);
  expect(Math.hypot(trailer.x - wanted.x, trailer.y - wanted.y)).toBeLessThan(0.05);
  expect(angle_between(trailer.heading, wanted.heading)).toBeLessThan(ONE_DEGREE);
  expect(parked_in(end, bay, spec)).toBe(true);
}

const SEEDS = 8;

describe("every generated spot can be reached with the vehicle's turning circle", () => {
  for (const scenario of SCENARIOS) {
    for (const vehicle of SCENARIO_INFO[scenario].vehicles) {
      for (const difficulty of [0, 0.5, 1]) {
        test(`${scenario} in a ${vehicle} at ${difficulty}`, { timeout: 120_000 }, () => {
          const spec = VEHICLES[vehicle];
          for (let seed = 1; seed <= SEEDS; seed++) {
            const world = scenario_world(seed * 7919, scenario, difficulty, spec);
            expect(world.bays, `seed ${seed}`).toHaveLength(1);
            expect(reachable(world, world.bays[0], spec), `seed ${seed}`).toBe(true);
          }
        });
      }
    }
  }

  test("every level", { timeout: 240_000 }, () => {
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      const round = level_round(level);
      const spec = spec_of(round);
      const world = scenario_world(round.seed, round.scenario!, round.difficulty, spec);
      expect(reachable(world, world.bays[0], spec), `level ${level}`).toBe(true);
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
