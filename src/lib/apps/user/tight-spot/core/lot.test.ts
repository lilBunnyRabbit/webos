import { describe, expect, test } from "vitest";
import { collide, obstacles } from "./obstacles";
import { CHUNK, chunk, exits, open_plan, open_world, SIDES } from "./lot";
import { SolidKind } from "./scene";

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

describe("open lot", () => {
  test("three by three chunks with many free bays", () => {
    const world = open_world(3);
    expect(world.chunks).toHaveLength(9);
    expect(world.bays.length).toBeGreaterThan(12);
    expect(world.bays.every((bay) => bay.either)).toBe(true);
    expect(collide(world.start, obstacles(world))).toBeNull();
  });
});
