import { describe, expect, test } from "vitest";
import { overlaps } from "../../core/collision";
import { SCENARIO_INFO } from "./game";
import { collide, obstacles } from "../../core/obstacles";
import { centroid } from "../../core/geometry";
import { BUS, corners, create_car, Gear, VEHICLES, type VehicleSpec } from "../../core/vehicle";
import type { Scenario } from "./world";

function specs(scenario: Scenario): VehicleSpec[] {
  return SCENARIO_INFO[scenario].vehicles.map((vehicle) => VEHICLES[vehicle]);
}
import { CHUNK, ChunkKind, SCENARIOS, scenario_world, SolidKind } from "./world";

describe("scenario worlds", () => {
  test("one lot and its street, one target bay, and a start that's clear of everything", () => {
    for (const scenario of SCENARIOS) {
      for (const difficulty of [0, 0.5, 1]) {
        for (let seed = 1; seed <= 20; seed++) {
          for (const spec of specs(scenario)) {
            const world = scenario_world(seed, scenario, difficulty, spec);
            const label = `${scenario} ${difficulty} ${seed}`;
            expect(
              world.chunks.filter((each) => each.kind !== ChunkKind.FLOOR).map((each) => each.kind),
              label
            ).toEqual([ChunkKind.LOT, ChunkKind.ROAD]);
            expect(world.bays, label).toHaveLength(1);
            expect(collide(create_car(world.start, Gear.PARK, spec), obstacles(world), spec), label).toBeNull();
          }
        }
      }
    }
  });

  test("no parked car sits in the target bay", () => {
    for (const scenario of SCENARIOS) {
      for (let seed = 1; seed <= 20; seed++) {
        for (const spec of specs(scenario)) {
          const world = scenario_world(seed, scenario, 1, spec);
          const cars = world.solids.filter((solid) => solid.kind === SolidKind.CAR);
          for (const car of cars) expect(overlaps(car.shape, world.bays[0].shape), `${scenario} ${seed}`).toBe(false);
        }
      }
    }
  });

  test("parked cars never overlap each other or a wall", () => {
    for (const scenario of SCENARIOS) {
      for (let seed = 1; seed <= 10; seed++) {
        for (const spec of specs(scenario)) {
          const world = scenario_world(seed, scenario, 1, spec);
          const cars = world.solids.filter((solid) => solid.kind === SolidKind.CAR);
          for (const car of cars) {
            for (const other of world.solids) {
              if (other === car || other.kind === SolidKind.KERB) continue;
              expect(overlaps(car.shape, other.shape), `${scenario} ${seed} ${other.kind}`).toBe(false);
            }
          }
        }
      }
    }
  });

  test("the depot bus starts with room behind it to back up first", () => {
    for (const difficulty of [0, 0.5, 1]) {
      for (let seed = 1; seed <= 30; seed++) {
        const start = scenario_world(seed, "depot", difficulty, BUS).start;
        const rear = Math.min(...corners(start, BUS).map((p) => p.x));
        expect(rear - 1.5, `${difficulty} ${seed}`).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test("the end bay starts inside its lot, close enough to frame the car and the bay together", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const world = scenario_world(seed, "end-bay", 0.5);
      expect(world.start.y, `${seed}`).toBeLessThan(CHUNK - 1);
      expect(world.start.y - centroid(world.bays[0].shape).y, `${seed}`).toBeLessThan(26);
    }
  });

  test("seeds change the layout within one difficulty, mirrored both ways where the kind mirrors", () => {
    const kinds = ["dead-end", "driveway", "slipway", "end-bay", "depot", "bus-stop", "camping"] as const;
    for (const scenario of kinds) {
      const spec = specs(scenario)[0];
      const seen = new Set<string>();
      const sides = new Set<boolean>();
      for (let seed = 1; seed <= 16; seed++) {
        const world = scenario_world(seed, scenario, 0.5, spec);
        const bay = centroid(world.bays[0].shape);
        seen.add(`${bay.x.toFixed(1)} ${bay.y.toFixed(1)} ${world.start.x.toFixed(1)} ${world.start.y.toFixed(1)}`);
        sides.add(bay.x < 16);
      }
      expect(seen.size, scenario).toBeGreaterThanOrEqual(12);
      if (scenario === "dead-end" || scenario === "driveway" || scenario === "slipway" || scenario === "camping") expect(sides.size, scenario).toBe(2);
    }
  });

  test("the parallel gap is never shorter than the car plus 1.3 m", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const bay = scenario_world(seed, "parallel", 1).bays[0];
      const ys = bay.shape.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys) + 0.2).toBeGreaterThanOrEqual(4.3 + 1.3 - 1e-9);
    }
  });
});
