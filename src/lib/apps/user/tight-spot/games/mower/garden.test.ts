import { describe, expect, test } from "vitest";
import { inside_convex, overlaps } from "../../core/collision";
import { collide, obstacles } from "../../core/obstacles";
import { create_car, Gear, MOWER } from "../../core/vehicle";
import { build_garden, layout } from "./garden";

const SEEDS = [1, 7, 42, 2026];

describe("garden", () => {
  test("the same seed builds the same garden", () => {
    expect(build_garden(42, 0.5)).toEqual(build_garden(42, 0.5));
    expect(build_garden(42, 0.5)).not.toEqual(build_garden(43, 0.5));
  });

  test("grows and tightens with difficulty", () => {
    const easy = layout(5, 0);
    const hard = layout(5, 1);
    expect(hard.width * hard.height).toBeGreaterThan(easy.width * easy.height);
    expect(hard.gap).toBeLessThan(easy.gap);
    expect(hard.gap).toBeGreaterThan(MOWER.width + 0.2);
  });

  for (const seed of SEEDS) {
    for (const difficulty of [0, 0.5, 1]) {
      test(`seed ${seed} at ${difficulty}: the mower starts clear on the patio, everything else is inside the hedges and apart`, () => {
        const garden = build_garden(seed, difficulty);
        const car = create_car(garden.start, Gear.PARK, MOWER);
        expect(collide(car, obstacles(garden), MOWER)).toBeNull();
        expect(inside_convex(garden.start, garden.patio)).toBe(true);
        const inside = { x0: 0, y0: 0, x1: garden.width, y1: garden.height };
        const things = [...garden.beds, ...garden.solids.filter((solid) => solid.kind !== "hedge").map((solid) => solid.shape)];
        for (const shape of things) {
          for (const p of shape) {
            expect(p.x).toBeGreaterThanOrEqual(inside.x0 - 1e-9);
            expect(p.x).toBeLessThanOrEqual(inside.x1 + 1e-9);
            expect(p.y).toBeGreaterThanOrEqual(inside.y0 - 1e-9);
            expect(p.y).toBeLessThanOrEqual(inside.y1 + 1e-9);
          }
        }
        for (let i = 0; i < things.length; i++) {
          for (let j = i + 1; j < things.length; j++) expect(overlaps(things[i], things[j])).toBe(false);
        }
      });
    }
  }
});
