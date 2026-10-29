import { describe, expect, test } from "vitest";
import { inside_convex, overlaps } from "../core/collision";
import { bounds_of } from "../core/geometry";
import { collide, obstacles } from "../core/obstacles";
import { plan } from "../core/planner";
import { bodies, Gear, NO_INPUT, rig_length, Vehicle, VEHICLES, type Car, type VehicleSpec } from "../core/vehicle";
import { Building } from "../games/define";
import { build_yard, District, district_of, door_at, door_car, drive, GARAGE, gate_car, nose, on_pad, pad_car, place, swap_car, type Yard } from "./yard";

const GAMES = [
  { id: "parking", building: Building.CAR_PARK },
  { id: "forklift", building: Building.WAREHOUSE },
  { id: "f1", building: Building.TRACK },
  { id: "ferry", building: Building.FERRY },
  { id: "mower", building: Building.GARDEN },
  { id: "airport", building: Building.APRON },
  { id: "rodeo", building: Building.ARENA },
  { id: "valet", building: Building.VALET_STAND },
  { id: "test", building: Building.TEST_CENTRE },
];
const TOWN = build_yard(GAMES);
// A grown town: a fifth Town game and a third Sport one (ids reused, only the district counts), two games no district
// names and a shut lot.
const GROWN = build_yard(
  [
    ...GAMES,
    { id: "valet", building: Building.CAR_PARK },
    { id: "rodeo", building: Building.TRACK },
    { id: "zoo", building: Building.GARDEN },
    { id: "mine", building: Building.WAREHOUSE },
  ],
  1
);

const SPECS = Object.entries(VEHICLES);
const near = obstacles(TOWN);

function clear(yard: Yard, car: Car, spec: VehicleSpec): boolean {
  return collide(car, obstacles(yard), spec) === null;
}

function in_doorway(yard: Yard, index: number): Car {
  const spec = VEHICLES.hatch;
  const { mouth, facing } = yard.plots[index];
  const back = rig_length(spec) / 2 - 1;
  return place({ x: mouth.x + Math.cos(facing) * back, y: mouth.y + Math.sin(facing) * back, heading: facing + Math.PI }, spec);
}

function doorway_goal(yard: Yard, index: number) {
  const { mouth, facing } = yard.plots[index];
  return { x: mouth.x + Math.cos(facing) * 3, y: mouth.y + Math.sin(facing) * 3, heading: facing + Math.PI };
}

describe("yard", () => {
  test("each district has its row, the airport on the waterfront, an unnamed game a lot by the gate", () => {
    expect(district_of("airport")).toBe(District.WATERFRONT);
    expect(district_of("zoo")).toBe(District.LOTS);
    const facing: Record<District, number> = { town: Math.PI / 2, sport: Math.PI, waterfront: -Math.PI / 2, industrial: 0, lots: 0 };
    for (const plot of TOWN.plots) expect(plot.facing, plot.game ?? "").toBeCloseTo(facing[plot.district]);
    expect(TOWN.plots.map((plot) => plot.game)).toEqual(GAMES.map((game) => game.id));
  });

  test("a district grows along its row and the court with it; nothing overlaps", () => {
    expect(GROWN.plots.filter((plot) => plot.district === District.TOWN)).toHaveLength(5);
    expect(GROWN.plots.filter((plot) => plot.district === District.SPORT)).toHaveLength(3);
    expect(GROWN.plots.filter((plot) => plot.district === District.LOTS)).toHaveLength(3);
    expect(GROWN.court.x1 - GROWN.court.x0).toBeGreaterThan(TOWN.court.x1 - TOWN.court.x0);
    expect(GROWN.court.y1 - GROWN.court.y0).toBeGreaterThan(TOWN.court.y1 - TOWN.court.y0);
    for (const yard of [TOWN, GROWN]) {
      const shapes = [...yard.plots.map((plot) => plot.shape), ...yard.houses.map((house) => house.shape)];
      for (let i = 0; i < shapes.length; i++) {
        for (let j = i + 1; j < shapes.length; j++) expect(overlaps(shapes[i], shapes[j]), `${i} and ${j}`).toBe(false);
      }
      for (const solid of yard.solids) {
        const box = bounds_of(solid.shape);
        expect(box.x0 >= yard.bounds.x0 - 1e-9 && box.x1 <= yard.bounds.x1 + 1e-9 && box.y0 >= yard.bounds.y0 - 1e-9 && box.y1 <= yard.bounds.y1 + 0.3).toBe(true);
      }
    }
  });

  test("the landing frames the gate and the plaza, not the whole town", () => {
    for (const yard of [TOWN, GROWN]) {
      const { landing } = yard;
      expect(landing.x0).toBeLessThanOrEqual(yard.gate.x);
      const pad = bounds_of(yard.pad);
      expect(pad.x1).toBeLessThanOrEqual(landing.x1);
      expect(landing.x1 - landing.x0).toBeLessThan(yard.bounds.x1 - yard.bounds.x0);
    }
  });

  test("every vehicle fits at the gate, out of each doorway and on the garage pad", () => {
    for (const yard of [TOWN, GROWN]) {
      for (const [name, spec] of SPECS) {
        expect(clear(yard, gate_car(yard, spec), spec), `${name} at the gate`).toBe(true);
        expect(clear(yard, pad_car(yard, spec), spec), `${name} on the pad`).toBe(true);
        expect(on_pad(yard, pad_car(yard, spec), spec), `${name} counts as on the pad`).toBe(true);
        for (let i = 0; i < yard.plots.length; i++) {
          const car = door_car(yard, i, spec);
          expect(clear(yard, car, spec), `${name} out of door ${i}`).toBe(true);
          expect(door_at(yard, car, spec), `${name} out of door ${i} is past its apron`).toBeNull();
          expect(on_pad(yard, car, spec), `${name} out of door ${i} isn't on the pad`).toBe(false);
        }
      }
    }
  });

  test("the garage shelves hold every vehicle once", () => {
    const shelved = GARAGE.flatMap((shelf) => shelf.vehicles);
    expect([...shelved].sort()).toEqual(Object.values(Vehicle).sort());
  });

  test("the pad sits on open ground, so a new vehicle never lands on something", () => {
    for (const solid of TOWN.solids) expect(overlaps(solid.shape, TOWN.pad)).toBe(false);
  });

  test("every open doorway offers its game; a shut lot offers nothing", () => {
    for (const yard of [TOWN, GROWN]) {
      yard.plots.forEach((plot, i) => {
        const at = in_doorway(yard, i);
        if (plot.open) expect(door_at(yard, at, VEHICLES.hatch), plot.game ?? "").toBe(i);
        else {
          expect(door_at(yard, at, VEHICLES.hatch)).toBeNull();
          expect(collide(at, obstacles(yard), VEHICLES.hatch)).not.toBeNull();
        }
      });
    }
    expect(GROWN.plots.at(-1)?.open).toBe(false);
  });

  // About 15 s at the yard's pace (the hatchback tops out at 8.4 m/s); the planner's path shuffles a little more than a driver.
  test("from the gate the hatchback and the bus reach every doorway, the hatchback the pad, all a short drive", () => {
    for (const [name, spec] of [
      ["hatch", VEHICLES.hatch],
      ["bus", VEHICLES.bus],
    ] as const) {
      const start = gate_car(TOWN, spec);
      for (let i = 0; i < TOWN.plots.length; i++) {
        const found = plan(start, doorway_goal(TOWN, i), near, { spec, arrive: (pose) => door_at(TOWN, pose, spec) === i });
        expect(found, `${name} to door ${i}`).not.toBeNull();
        expect(door_at(TOWN, found!.path.at(-1)!, spec)).toBe(i);
        if (name === "hatch") expect(found!.moves.reduce((sum, move) => sum + Math.abs(move.distance), 0), `door ${i}`).toBeLessThan(110);
      }
    }
    const spec = VEHICLES.hatch;
    const pad = plan(gate_car(TOWN, spec), pad_car(TOWN, spec), near, { spec, arrive: (pose) => on_pad(TOWN, pose, spec) });
    expect(pad).not.toBeNull();
  });

  test("a vehicle swapped from the toolbar takes the old one's place, or the nearest clear spot when it doesn't fit", () => {
    const hatch = VEHICLES.hatch;
    const train = VEHICLES["road-train"];
    const open = swap_car(TOWN, pad_car(TOWN, hatch), hatch, train);
    expect(open.moved).toBe(false);
    expect(Math.hypot(open.car.x - pad_car(TOWN, train).x, open.car.y - pad_car(TOWN, train).y)).toBeLessThan(1e-6);
    for (let i = 0; i < TOWN.plots.length; i++) {
      const tight = swap_car(TOWN, in_doorway(TOWN, i), hatch, train);
      expect(tight.moved, `door ${i}`).toBe(true);
      expect(clear(TOWN, tight.car, train), `door ${i}`).toBe(true);
    }
  });

  test("driving into a cone stops the car short of it and says where, and it backs away again", () => {
    const spec = VEHICLES.hatch;
    const cone = TOWN.cones[2];
    expect(inside_convex(cone, TOWN.pad)).toBe(false);
    let car: Car = { ...place({ x: cone.x, y: cone.y + 6, heading: -Math.PI / 2 }, spec), gear: Gear.DRIVE };
    expect(clear(TOWN, car, spec)).toBe(true);
    let hit = null;
    for (let i = 0; i < 120 * 20 && !hit; i++) ({ car, hit } = drive(TOWN, car, { ...NO_INPUT, throttle: 1 }, 1 / 120, spec));
    expect(hit).not.toBeNull();
    expect(car.speed).toBe(0);
    expect(clear(TOWN, car, spec)).toBe(true);
    expect(nose(car, spec).y).toBeGreaterThan(cone.y);
    for (const body of bodies(car, spec)) expect(body.every((corner) => corner.y > cone.y - 1)).toBe(true);
    car = { ...car, gear: Gear.REVERSE };
    const before = car.y;
    for (let i = 0; i < 120; i++) ({ car, hit } = drive(TOWN, car, { ...NO_INPUT, throttle: 1 }, 1 / 120, spec));
    expect(hit).toBeNull();
    expect(car.y).toBeGreaterThan(before);
  });
});
