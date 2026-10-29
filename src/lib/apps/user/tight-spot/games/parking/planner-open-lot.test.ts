import { describe, expect, test } from "vitest";
import { create_game, open_round, parked_in, vehicles_for } from "./game";
import { collide, obstacles } from "../../core/obstacles";
import { drive, plan, type Move } from "../../core/planner";
import { parked_poses } from "./poses";
import { centroid, type Pose } from "../../core/geometry";
import { jackknifed, Vehicle, VEHICLES, type Placement, type VehicleSpec } from "../../core/vehicle";
import { ChunkKind, CHUNK, SIDES, SurfaceKind, type Bay, type Side, type World } from "./world";

/**
 * Its own file so the trailer's searches run beside the spot sweeps. Cars take every free bay; the trailer, whose
 * searches run seconds to a minute a bay, takes a fixed sample: per seed, a bay of each way a lot's bays face, so each
 * lot kind and both sides are proven; it gets no kerb bays. A reverse-only path out of a bay is a forward path
 * in, which a towed trailer follows stably, so it's replayed forward from a straight trailer; reversing one would
 * amplify any difference, so the fallback searches from the gate with the trailer straight instead.
 */

const PIECE = 0.15;

function gate_pose(cx: number, cy: number, side: Side): Pose {
  const mid = { x: (cx + 0.5) * CHUNK, y: (cy + 0.5) * CHUNK };
  const out = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } }[side];
  return { x: mid.x + out.x * (CHUNK / 2 + 4), y: mid.y + out.y * (CHUNK / 2 + 4), heading: Math.atan2(out.y, out.x) };
}

function straight(pose: Pose, spec: VehicleSpec): Placement {
  return { x: pose.x, y: pose.y, heading: pose.heading, trailers: spec.hitches.map(() => ({ heading: pose.heading, roll: [0, 0] })) };
}

function drives_into(from: Placement, moves: readonly Move[], bay: Bay, world: World, spec: VehicleSpec): boolean {
  const near = obstacles(world);
  let at = from;
  for (const move of moves) {
    const pieces = Math.max(1, Math.round(Math.abs(move.distance) / PIECE));
    for (let k = 0; k < pieces; k++) {
      at = drive(at, { ...move, distance: move.distance / pieces }, spec);
      if (jackknifed(at, spec) || collide(at, near, spec)) return false;
    }
  }
  return parked_in(at, bay, spec);
}

function towed_in(bay: Bay, gate: Pose, world: World, spec: VehicleSpec): boolean {
  const near = obstacles(world);
  const poses = parked_poses(bay, near, 0.05, spec).slice(0, 6);
  const forward = poses.some((pose) => {
    const out = plan(pose, gate, near, { spec, directions: [-1], heading_tolerance: Math.PI, max_expansions: 60_000 });
    if (!out) return false;
    const moves = [...out.moves].reverse().map((move) => ({ ...move, distance: -move.distance }));
    return drives_into(straight(out.path[out.path.length - 1], spec), moves, bay, world, spec);
  });
  if (forward) return true;
  const inward = straight({ ...gate, heading: gate.heading + Math.PI }, spec);
  return poses.slice(0, 3).some((pose) => {
    const found = plan(inward, pose, near, { spec, arrive: (at) => parked_in(at, bay, spec) });
    return found !== null && drives_into(inward, found.moves, bay, world, spec);
  });
}

const TOWING_SAMPLE: Record<number, Record<string, readonly number[]>> = {
  5: { "-1,-1": [3, 6], "1,-1": [1, 6], "-1,1": [4, 8], "1,1": [6, 8] },
  13: { "-1,-1": [2, 7], "1,-1": [3, 6], "-1,1": [4, 7], "1,1": [2, 6] },
};

function facing(bay: Bay): number {
  const degrees = Math.round((bay.heading * 180) / Math.PI);
  return ((degrees % 360) + 360) % 360;
}

// Seeds with an underground garage and kerb bays on both east–west roads, so every kind of free bay gets proven.
const SEEDS = [5, 13];


describe("free bays in the open lot can be reached through their lot's gate", () => {
  test("the seeds cover a garage and kerb bays", () => {
    const worlds = SEEDS.map((seed) => create_game(open_round(seed, Vehicle.HATCH)).world);
    const chunks = worlds.flatMap((world) => world.chunks);
    expect(chunks.some((each) => each.kind === ChunkKind.KERBSIDE && each.bays.length > 0)).toBe(true);
    expect(chunks.some((each) => each.surfaces.some((surface) => surface.kind === SurfaceKind.GARAGE) && each.bays.length > 0)).toBe(true);
  });

  for (const vehicle of vehicles_for(null)) {
    for (const seed of SEEDS) {
      test(`${VEHICLES[vehicle].hitches.length > 0 ? "a sample" : "every bay"} in a ${vehicle}, seed ${seed}`, { timeout: 120_000 }, () => {
        const spec = VEHICLES[vehicle];
        const { world, car } = create_game(open_round(seed, vehicle));
        const near = obstacles(world);
        const lots = world.chunks.filter((each) => each.kind === ChunkKind.LOT);
        expect(lots).toHaveLength(4);
        for (const lot of lots) {
          const side = SIDES.find((each) => lot.exits[each])!;
          const gate = gate_pose(lot.cx, lot.cy, side);
          expect(plan(car, gate, near, { spec, heading_tolerance: Math.PI }), `gate ${lot.cx},${lot.cy}`).not.toBeNull();
          expect(lot.bays.length).toBeGreaterThan(0);
          let bays = lot.bays;
          if (spec.hitches.length > 0) {
            bays = TOWING_SAMPLE[seed][`${lot.cx},${lot.cy}`].map((index) => lot.bays[index]);
            const sides = new Set(bays.map(facing));
            expect([...new Set(lot.bays.map(facing))].every((each) => sides.has(each)), `sample at ${lot.cx},${lot.cy}`).toBe(true);
          }
          for (const bay of bays) {
            const ok = spec.hitches.length > 0
              ? towed_in(bay, gate, world, spec)
              : parked_poses(bay, near, 0.05, spec).some(
                  (pose) => plan(pose, gate, near, { spec, heading_tolerance: Math.PI }) !== null
                );
            expect(ok, `bay at ${centroid(bay.shape).x.toFixed(1)},${centroid(bay.shape).y.toFixed(1)}`).toBe(true);
          }
        }
        // A kerb bay is proven out to the crossroads the round starts on.
        for (const road of world.chunks.filter((each) => each.kind === ChunkKind.KERBSIDE)) {
          if (spec.hitches.length > 0) expect(road.bays).toHaveLength(0);
          for (const bay of road.bays) {
            const ok = parked_poses(bay, near, 0.05, spec).some(
              (pose) => plan(pose, world.start, near, { spec, heading_tolerance: Math.PI }) !== null
            );
            expect(ok, `kerb bay at ${centroid(bay.shape).x.toFixed(1)},${centroid(bay.shape).y.toFixed(1)}`).toBe(true);
          }
        }
      });
    }
  }
});
