import { describe, expect, test } from "vitest";
import { body_velocity, create_boat, measure_carry, measure_kick, measure_top, measure_turn, measure_walk, speed, step_boat, type Boat } from "./boat";
import { BOAT_IDS, boat_coefficients, BoatId, SPECS } from "./boats";

const DT = 1 / 120;
const near = (value: number, target: number, share = 0.04) => expect(Math.abs(value - target)).toBeLessThanOrEqual(Math.abs(target) * share + 1e-3);

describe.each(BOAT_IDS)("%s meets its feel numbers", (id) => {
  const spec = SPECS[id];
  const c = boat_coefficients(id);

  test("speeds and carry", () => {
    near(measure_top(c, 1), spec.top_speed);
    near(measure_top(c, -1), spec.astern_speed);
    near(measure_carry(c), spec.carry);
  });

  test("turn, kick and walk", () => {
    near(measure_turn(c), spec.turn_rate);
    near(measure_kick(c), spec.kick);
    near(measure_walk(c), spec.walk);
  });
});

function run(boat: Boat, seconds: number, lever: number, wheel = 0, id: BoatId = BoatId.YACHT): Boat {
  const c = boat_coefficients(id);
  for (let t = 0; t < seconds; t += DT) boat = step_boat(boat, { lever, wheel }, c, DT);
  return boat;
}

describe("handling", () => {
  test("the gearbox waits in neutral between ahead and astern", () => {
    const ahead = run(create_boat({ x: 0, y: 0, heading: 0 }), 5, 1);
    expect(ahead.gear).toBe(1);
    const shifting = run(ahead, 0.3, -1);
    expect(shifting.gear).toBe(0);
    expect(run(shifting, 1, -1).gear).toBe(-1);
  });

  test("the yacht's rudder is weak without flow, the outboard steers from rest", () => {
    const yacht = run(create_boat({ x: 0, y: 0, heading: 0 }), 2, 0, 1);
    expect(Math.abs(yacht.heading)).toBeLessThan(1e-6);
    const rib = run(create_boat({ x: 0, y: 0, heading: 0 }), 2, -0.6, 1, BoatId.RIB);
    expect(Math.abs(rib.heading)).toBeGreaterThan(0.1);
  });

  test("astern the yacht's stern walks to port: the bow swings to starboard", () => {
    const boat = run(create_boat({ x: 0, y: 0, heading: 0 }), 6, -1);
    expect(body_velocity(boat).u).toBeLessThan(0);
    expect(boat.heading).toBeGreaterThan(0.02);
  });

  test("full astern with the wheel hard over stays near astern speed", () => {
    const boat = run(create_boat({ x: 0, y: 0, heading: 0 }), 60, -1, 1);
    expect(speed(boat)).toBeLessThan(SPECS[BoatId.YACHT].astern_speed);
  });

  test("coasting comes to a dead stop", () => {
    const boat = run({ ...create_boat({ x: 0, y: 0, heading: 0 }), vx: 1 }, 90, 0);
    expect(speed(boat)).toBe(0);
    expect(boat.r).toBe(0);
  });
});
