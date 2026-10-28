import { describe, expect, test } from "vitest";
import { inside_convex, overlaps } from "../../core/collision";
import { collide, obstacles } from "../../core/obstacles";
import { create_car, FORKLIFT, Gear } from "../../core/vehicle";
import { build_floor, layout, pallet_shape, SlotKind } from "./warehouse";

const SEEDS = [1, 7, 42, 2026, 99_001];

describe("warehouse floor", () => {
  test("the same seed builds the same floor and job", () => {
    expect(build_floor(42, 0.5, 3)).toEqual(build_floor(42, 0.5, 3));
    expect(build_floor(42, 0.5, 3)).not.toEqual(build_floor(43, 0.5, 3));
  });

  test("tightens its aisles and bays with difficulty", () => {
    const easy = layout(5, 0);
    const hard = layout(5, 1);
    expect(hard.aisle).toBeLessThan(easy.aisle);
    expect(hard.clear).toBeLessThan(easy.clear);
    expect(hard.clear).toBeGreaterThanOrEqual(0.1);
  });

  for (const seed of SEEDS) {
    for (const difficulty of [0, 0.5, 1]) {
      test(`seed ${seed} at ${difficulty}: every pallet sits clear inside its slot, the forklift starts clear`, () => {
        const floor = build_floor(seed, difficulty, 4);
        const near = obstacles(floor);
        expect(collide(create_car(floor.start, Gear.PARK, FORKLIFT), near, FORKLIFT)).toBeNull();
        for (const slot of floor.slots) {
          const shape = pallet_shape(slot.home);
          expect(shape.every((corner) => inside_convex(corner, slot.shape)), slot.name).toBe(true);
          const others = floor.solids.filter((solid) => !(solid.kind === "pallet" && solid.shape.every((p, i) => Math.abs(p.x - shape[i].x) < 1e-9)));
          expect(others.some((solid) => overlaps(shape, solid.shape)), slot.name).toBe(false);
        }
      });

      test(`seed ${seed} at ${difficulty}: a job of four uses distinct slots, sources hold its pallets and targets are free`, () => {
        const floor = build_floor(seed, difficulty, 4);
        expect(floor.tasks).toHaveLength(4);
        const used = floor.tasks.flatMap((task) => [task.from.name, task.to.name]);
        expect(new Set(used).size).toBe(used.length);
        const stocked = new Set(floor.stock.map((pose) => `${pose.x.toFixed(3)},${pose.y.toFixed(3)}`));
        for (const task of floor.tasks) {
          expect(stocked.has(`${task.from.home.x.toFixed(3)},${task.from.home.y.toFixed(3)}`)).toBe(false);
          expect(stocked.has(`${task.to.home.x.toFixed(3)},${task.to.home.y.toFixed(3)}`)).toBe(false);
        }
      });
    }
  }

  test("has three to six dock spots on the south wall, named in order, and racks lettered from the north", () => {
    const floor = build_floor(7, 0.3, 1);
    const docks = floor.slots.filter((slot) => slot.kind === SlotKind.DOCK);
    expect(docks.length).toBeGreaterThanOrEqual(3);
    expect(docks.length).toBeLessThanOrEqual(6);
    expect(docks.map((slot) => slot.name).slice(0, 3)).toEqual(["Dock A", "Dock B", "Dock C"]);
    for (const dock of docks) expect(dock.heading).toBeCloseTo(Math.PI / 2, 9);
    expect(floor.faces[0].letter).toBe("A");
    expect(floor.faces[0].facing).toBe(1);
  });
});
