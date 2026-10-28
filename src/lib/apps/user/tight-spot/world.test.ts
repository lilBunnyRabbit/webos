import { describe, expect, test } from "vitest";
import { overlaps } from "./collision";
import { collide, obstacles } from "./game";
import { CHUNK, chunk, ChunkKind, exits, open_plan, open_world, SCENARIOS, scenario_world, SIDES, SolidKind } from "./world";

describe("chunk", () => {
  test("is pure: the same seed and cell give the same chunk", () => {
    const plan = open_plan(9);
    expect(chunk(9, 1, 1, plan)).toEqual(chunk(9, 1, 1, plan));
    expect(chunk(9, 1, 1, plan)).not.toEqual(chunk(10, 1, 1, open_plan(10)));
  });

  test("exits line up with the neighbour on the other side", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const plan = open_plan(seed);
      for (let cy = -1; cy <= 1; cy++) {
        for (let cx = -1; cx <= 1; cx++) {
          const here = exits(plan, cx, cy);
          if (cx < 1) expect(here.e, `${seed} ${cx},${cy} east`).toBe(exits(plan, cx + 1, cy).w);
          if (cy < 1) expect(here.s, `${seed} ${cx},${cy} south`).toBe(exits(plan, cx, cy + 1).n);
        }
      }
    }
  });

  test("every lot in the open lot opens onto a road, and the roads all join up", () => {
    const plan = open_plan(4);
    for (const [cx, cy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const open = exits(plan, cx, cy);
      expect(SIDES.filter((side) => open[side])).toHaveLength(1);
    }
    expect(exits(plan, 0, 0)).toEqual({ n: true, e: true, s: true, w: true });
  });

  test("a side facing the edge of the world gets a wall", () => {
    const edge = chunk(1, 0, 1, open_plan(1))!;
    const wall = edge.solids.filter((solid) => solid.kind === SolidKind.WALL);
    expect(wall.some((solid) => solid.shape.every((p) => p.y >= 2 * CHUNK - 1))).toBe(true);
  });
});

describe("scenario worlds", () => {
  test("one lot and its street, one target bay, and a start that's clear of everything", () => {
    for (const scenario of SCENARIOS) {
      for (const difficulty of [0, 0.5, 1]) {
        for (let seed = 1; seed <= 20; seed++) {
          const world = scenario_world(seed, scenario, difficulty);
          const label = `${scenario} ${difficulty} ${seed}`;
          expect(world.chunks.map((each) => each.kind), label).toEqual([ChunkKind.LOT, ChunkKind.ROAD]);
          expect(world.bays, label).toHaveLength(1);
          expect(collide(world.start, obstacles(world)), label).toBeNull();
        }
      }
    }
  });

  test("no parked car sits in the target bay", () => {
    for (const scenario of SCENARIOS) {
      for (let seed = 1; seed <= 20; seed++) {
        const world = scenario_world(seed, scenario, 1);
        const cars = world.solids.filter((solid) => solid.kind === SolidKind.CAR);
        for (const car of cars) expect(overlaps(car.shape, world.bays[0].shape), `${scenario} ${seed}`).toBe(false);
      }
    }
  });

  test("parked cars never overlap each other or a wall", () => {
    for (const scenario of SCENARIOS) {
      for (let seed = 1; seed <= 10; seed++) {
        const world = scenario_world(seed, scenario, 1);
        const cars = world.solids.filter((solid) => solid.kind === SolidKind.CAR);
        for (const car of cars) {
          for (const other of world.solids) {
            if (other === car || other.kind === SolidKind.KERB) continue;
            expect(overlaps(car.shape, other.shape), `${scenario} ${seed} ${other.kind}`).toBe(false);
          }
        }
      }
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

describe("open lot", () => {
  test("three by three chunks with many free bays", () => {
    const world = open_world(3);
    expect(world.chunks).toHaveLength(9);
    expect(world.bays.length).toBeGreaterThan(12);
    expect(world.bays.every((bay) => bay.either)).toBe(true);
    expect(collide(world.start, obstacles(world))).toBeNull();
  });
});
