import { describe, expect, test } from "vitest";
import { inside_convex, overlaps } from "../core/collision";
import { bounds_of } from "../core/geometry";
import { collide, obstacles } from "../core/obstacles";
import { plan } from "../core/planner";
import { bodies, Gear, NO_INPUT, rig_length, Vehicle, VEHICLES, type Car } from "../core/vehicle";
import { build_yard, door_at, door_car, drive, GARAGE, gate_car, nose, on_pad, pad_car, pairs, place, type Yard } from "./yard";

const YARD = build_yard(2);
const STREET = build_yard(7, 1);

const SPECS = Object.entries(VEHICLES);
const near = obstacles(YARD);

function clear(yard: Yard, car: Car, spec: (typeof VEHICLES)[keyof typeof VEHICLES]): boolean {
  return collide(car, obstacles(yard), spec) === null;
}

function in_doorway(yard: Yard, index: number): Car {
  const spec = VEHICLES.hatch;
  const { mouth, facing } = yard.plots[index];
  const back = rig_length(spec) / 2 - 1;
  return place({ x: mouth.x + Math.cos(facing) * back, y: mouth.y + Math.sin(facing) * back, heading: facing + Math.PI }, spec);
}

describe("yard", () => {
  test("a pair of buildings per two places, every game's open, the street growing east", () => {
    for (let games = 1; games <= 9; games++) {
      const yard = build_yard(games);
      expect(yard.plots, `${games} games`).toHaveLength(pairs(games) * 2);
      expect(yard.plots.filter((plot) => plot.open)).toHaveLength(games);
      expect(yard.bounds.x1).toBeGreaterThan(Math.max(...yard.plots.flatMap((plot) => plot.shape.map((p) => p.x))));
      for (let i = 0; i < yard.plots.length; i++) {
        for (let j = i + 1; j < yard.plots.length; j++) expect(overlaps(yard.plots[i].shape, yard.plots[j].shape)).toBe(false);
      }
    }
    expect(build_yard(4).bounds.x1).toBeGreaterThan(build_yard(2).bounds.x1);
    expect(build_yard(3).bounds.x1).toBe(build_yard(4).bounds.x1);
  });

  test("the landing frames the gate and the first pair, not the whole street", () => {
    for (const yard of [YARD, STREET]) {
      const { landing } = yard;
      expect(landing.x0).toBeLessThanOrEqual(yard.gate.x);
      for (const plot of yard.plots.slice(0, 2)) expect(bounds_of(plot.shape).x1).toBeLessThanOrEqual(landing.x1);
    }
    expect(STREET.landing.x1).toBeLessThan(STREET.bounds.x1 / 2);
  });

  test("every vehicle fits at the gate, out of each doorway and on the garage pad", () => {
    for (const yard of [YARD, STREET]) {
      for (const [name, spec] of SPECS) {
        expect(clear(yard, gate_car(yard, spec), spec), `${name} at the gate`).toBe(true);
        expect(clear(yard, pad_car(yard, spec), spec), `${name} on the pad`).toBe(true);
        expect(on_pad(yard, pad_car(yard, spec), spec), `${name} counts as on the pad`).toBe(true);
        for (let i = 0; i < yard.plots.length; i++) {
          const car = door_car(yard, i, spec);
          expect(clear(yard, car, spec), `${name} out of door ${i}`).toBe(true);
          expect(door_at(yard, car, spec), `${name} out of door ${i} is past its apron`).toBeNull();
        }
      }
    }
  });

  test("the garage shelves hold every vehicle once", () => {
    const shelved = GARAGE.flatMap((shelf) => shelf.vehicles);
    expect([...shelved].sort()).toEqual(Object.values(Vehicle).sort());
  });

  test("the pad sits on open ground, so a new vehicle never lands on something", () => {
    for (const solid of YARD.solids) expect(overlaps(solid.shape, YARD.pad)).toBe(false);
  });

  test("a doorway on either side of the street offers its game", () => {
    for (let i = 0; i < STREET.plots.length - 1; i++) expect(door_at(STREET, in_doorway(STREET, i), VEHICLES.hatch)).toBe(i);
  });

  test("a closed building's doorway is shut and offers nothing", () => {
    const spec = VEHICLES.hatch;
    const closed = build_yard(1);
    const at = in_doorway(closed, 1);
    expect(door_at(YARD, at, spec)).toBe(1);
    expect(door_at(closed, at, spec)).toBeNull();
    expect(collide(at, obstacles(closed), spec)).not.toBeNull();
    expect(collide(at, near, spec)).toBeNull();
    expect(STREET.plots[7].open).toBe(false);
  });

  test("from the gate the hatchback reaches every doorway and the pad", () => {
    const spec = VEHICLES.hatch;
    const start = gate_car(YARD, spec);
    for (let i = 0; i < YARD.plots.length; i++) {
      const { mouth, facing } = YARD.plots[i];
      const goal = { x: mouth.x + Math.cos(facing) * 3, y: mouth.y + Math.sin(facing) * 3, heading: facing + Math.PI };
      const found = plan(start, goal, near, { spec, arrive: (pose) => door_at(YARD, pose, spec) === i });
      expect(found, `door ${i}`).not.toBeNull();
      expect(door_at(YARD, found!.path.at(-1)!, spec)).toBe(i);
    }
    const pad = plan(start, pad_car(YARD, spec), near, { spec, arrive: (pose) => on_pad(YARD, pose, spec) });
    expect(pad).not.toBeNull();
  });

  test("driving into a cone stops the car short of it and says where, and it backs away again", () => {
    const spec = VEHICLES.hatch;
    const cone = YARD.cones[2];
    expect(inside_convex(cone, YARD.pad)).toBe(false);
    let car: Car = { ...place({ x: cone.x, y: cone.y + 6, heading: -Math.PI / 2 }, spec), gear: Gear.DRIVE };
    let hit = null;
    for (let i = 0; i < 120 * 20 && !hit; i++) ({ car, hit } = drive(YARD, car, { ...NO_INPUT, throttle: 1 }, 1 / 120, spec));
    expect(hit).not.toBeNull();
    expect(car.speed).toBe(0);
    expect(clear(YARD, car, spec)).toBe(true);
    expect(nose(car, spec).y).toBeGreaterThan(cone.y);
    for (const body of bodies(car, spec)) expect(body.every((corner) => corner.y > cone.y - 1)).toBe(true);
    car = { ...car, gear: Gear.REVERSE };
    const before = car.y;
    for (let i = 0; i < 120; i++) ({ car, hit } = drive(YARD, car, { ...NO_INPUT, throttle: 1 }, 1 / 120, spec));
    expect(hit).toBeNull();
    expect(car.y).toBeGreaterThan(before);
  });
});
