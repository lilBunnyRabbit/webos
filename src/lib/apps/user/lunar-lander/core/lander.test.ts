import { describe, expect, test } from "vitest";
import { BODIES, BODY_IDS, BodyId } from "./bodies";
import { DT, flat, measure_drop, measure_hover, measure_spin, measure_tank, parked_ship, step_ship, VACUUM, type Ship } from "./lander";
import { SHIP_IDS, ship_coefficients, ShipId, SPECS } from "./ships";

const near = (value: number, target: number, share = 0.03) => expect(Math.abs(value - target)).toBeLessThanOrEqual(Math.abs(target) * share + 1e-3);

describe.each(SHIP_IDS)("the %s meets its feel numbers", (id) => {
  const spec = SPECS[id];
  const c = ship_coefficients(id);

  test.each(BODY_IDS)("hovers at its throttle on the %s, and the tank lasts", (body) => {
    near(measure_hover(c, BODIES[body]), spec.hover[body]);
    near(measure_tank(c, BODIES[body]), spec.tank, 0.01);
  });

  test("spins up to its rate in its time", () => {
    const spin = measure_spin(c);
    near(spin.peak, spec.spin);
    near(spin.rise, spec.spin_up, 0.04);
  });

  test("the legs take a safe touchdown on Earth, and the hull stays clear", () => {
    const drop = measure_drop(c, BODIES[BodyId.EARTH], spec.safe.sink);
    near(drop.stroke, spec.travel);
    expect(drop.hull).toBe(false);
  });
});

test("the pods turn only on thrust", () => {
  const c = ship_coefficients(ShipId.PODS);
  let ship: Ship = { ...parked_ship(c, 0, 0, BODIES[BodyId.MOON]), y: 500, on: [false, false] };
  for (let t = 0; t < 2; t += DT) ship = step_ship(ship, { throttle: 0, turn: 1 }, c, DT, VACUUM);
  expect(ship.spin).toBe(0);
  for (let t = 0; t < 2; t += DT) ship = step_ship(ship, { throttle: 0.5, turn: 1 }, c, DT, VACUUM);
  expect(ship.spin).toBeGreaterThan(0.2);
});

test("a parked ship stays put", () => {
  const c = ship_coefficients(ShipId.LANDER);
  const env = flat(BODIES[BodyId.MARS]);
  let ship = parked_ship(c, 0, 0, env.body);
  const y = ship.y;
  for (let t = 0; t < 5; t += DT) ship = step_ship(ship, { throttle: 0, turn: 0 }, c, DT, env);
  expect(Math.abs(ship.y - y)).toBeLessThan(0.01);
  expect(Math.abs(ship.x)).toBeLessThan(0.001);
});
