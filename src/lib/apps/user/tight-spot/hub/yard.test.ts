import { describe, expect, test } from "vitest";
import { overlaps } from "../core/collision";
import { collide, obstacles } from "../core/obstacles";
import { plan } from "../core/planner";
import { bodies, Gear, NO_INPUT, VEHICLES, type Car } from "../core/vehicle";
import { build_yard, door_at, door_car, drive, gate_car, nose, on_pad, pad_car } from "./yard";

const YARD = build_yard(2);

const SPECS = Object.entries(VEHICLES);
const near = obstacles(YARD);

function clear(car: Car, spec: (typeof VEHICLES)[keyof typeof VEHICLES]): boolean {
  return collide(car, near, spec) === null;
}

describe("yard", () => {
  test("every vehicle fits at the gate, out of each doorway and on the garage pad", () => {
    for (const [name, spec] of SPECS) {
      expect(clear(gate_car(YARD, spec), spec), `${name} at the gate`).toBe(true);
      expect(clear(pad_car(YARD, spec), spec), `${name} on the pad`).toBe(true);
      expect(on_pad(YARD, pad_car(YARD, spec), spec), `${name} counts as on the pad`).toBe(true);
      for (let i = 0; i < YARD.plots.length; i++) {
        const car = door_car(YARD, i, spec);
        expect(clear(car, spec), `${name} out of door ${i}`).toBe(true);
        expect(door_at(YARD, car, spec), `${name} out of door ${i} is past its apron`).toBeNull();
      }
    }
  });

  test("the pad sits on open ground, so a new vehicle never lands on something", () => {
    for (const solid of YARD.solids) expect(overlaps(solid.shape, YARD.pad)).toBe(false);
  });

  test("a closed building's doorway is shut and offers nothing", () => {
    const spec = VEHICLES.hatch;
    const closed = build_yard(1);
    const mouth = closed.plots[1].mouth;
    const at = { ...gate_car(closed, spec), x: mouth.x, y: mouth.y - 1 + (spec.length - spec.rear_overhang), heading: -Math.PI / 2 };
    expect(door_at(YARD, at, spec)).toBe(1);
    expect(door_at(closed, at, spec)).toBeNull();
    expect(collide(at, obstacles(closed), spec)).not.toBeNull();
    expect(collide(at, near, spec)).toBeNull();
  });

  test("from the gate the hatchback reaches every doorway and the pad", () => {
    const spec = VEHICLES.hatch;
    const start = gate_car(YARD, spec);
    for (let i = 0; i < YARD.plots.length; i++) {
      const mouth = YARD.plots[i].mouth;
      const found = plan(start, { x: mouth.x, y: mouth.y + 3, heading: -Math.PI / 2 }, near, {
        spec,
        arrive: (pose) => door_at(YARD, pose, spec) === i,
      });
      expect(found, `door ${i}`).not.toBeNull();
      expect(door_at(YARD, found!.path.at(-1)!, spec)).toBe(i);
    }
    const pad = plan(start, pad_car(YARD, spec), near, { spec, arrive: (pose) => on_pad(YARD, pose, spec) });
    expect(pad).not.toBeNull();
  });

  test("driving into a cone stops the car short of it and says where", () => {
    const spec = VEHICLES.hatch;
    const cone = YARD.cones[2];
    let car: Car = { ...gate_car(YARD, spec), x: cone.x, gear: Gear.DRIVE };
    let hit = null;
    for (let i = 0; i < 120 * 20 && !hit; i++) ({ car, hit } = drive(YARD, car, { ...NO_INPUT, throttle: 1 }, 1 / 120, spec));
    expect(hit).not.toBeNull();
    expect(car.speed).toBe(0);
    expect(clear(car, spec)).toBe(true);
    expect(nose(car, spec).y).toBeGreaterThan(cone.y);
    for (const body of bodies(car, spec)) expect(body.every((corner) => corner.y > cone.y - 1)).toBe(true);
  });

  test("a stopped car backs away from what it touched", () => {
    const spec = VEHICLES.hatch;
    const cone = YARD.cones[2];
    let car: Car = { ...gate_car(YARD, spec), x: cone.x, gear: Gear.DRIVE };
    let hit = null;
    for (let i = 0; i < 120 * 20 && !hit; i++) ({ car, hit } = drive(YARD, car, { ...NO_INPUT, throttle: 1 }, 1 / 120, spec));
    car = { ...car, gear: Gear.REVERSE };
    const before = car.y;
    for (let i = 0; i < 120; i++) ({ car, hit } = drive(YARD, car, { ...NO_INPUT, throttle: 1 }, 1 / 120, spec));
    expect(hit).toBeNull();
    expect(car.y).toBeGreaterThan(before);
  });
});
