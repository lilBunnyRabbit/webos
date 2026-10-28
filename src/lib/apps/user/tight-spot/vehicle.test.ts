import { describe, expect, test } from "vitest";
import { angle_between } from "./geometry";
import {
  corners,
  create_car,
  Gear,
  HATCHBACK,
  max_steer,
  NO_INPUT,
  shift,
  step,
  turn_centre,
  wheels,
  type Car,
  type Input,
} from "./vehicle";

const DT = 1 / 120;
const START = { x: 0, y: 0, heading: 0 };

function run(car: Car, input: Input, seconds: number): Car {
  let next = car;
  for (let i = 0; i < Math.round(seconds / DT); i++) next = step(next, input, DT);
  return next;
}

function at_full_lock(gear: Gear, side: 1 | -1 = 1): Car {
  const parked = { ...create_car(START), gear } as Car;
  return run(parked, { steer: side, throttle: 0, brake: 1 }, 2);
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe("steering geometry", () => {
  test("full lock gives a 5.3 m kerb-to-kerb turning radius at the outer front wheel", () => {
    const car = at_full_lock(Gear.DRIVE);
    expect(car.steer).toBeCloseTo(max_steer(HATCHBACK), 6);
    const centre = turn_centre(car)!;
    const outer_front = wheels(car)[0];
    expect(distance(outer_front.at, centre)).toBeCloseTo(5.3, 2);
  });

  test("the car turns about a point on the rear axle line, so the rear axle traces the smallest circle", () => {
    let car = at_full_lock(Gear.DRIVE);
    const centre = turn_centre(car)!;
    const radius = HATCHBACK.wheelbase / Math.tan(max_steer(HATCHBACK));
    expect(radius).toBeCloseTo(3.84, 1);
    for (let i = 0; i < 2000; i++) {
      car = step(car, { steer: 1, throttle: 0, brake: 0 }, DT);
      expect(distance(car, centre)).toBeCloseTo(radius, 3);
    }
    expect(Math.abs(car.heading)).toBeGreaterThan(Math.PI / 2);
  });

  test("the rear axle never slides sideways: it only moves along the heading", () => {
    let car = run({ ...create_car(START), gear: Gear.DRIVE }, { steer: 0.7, throttle: 0.6, brake: 0 }, 1);
    for (let i = 0; i < 400; i++) {
      const next = step(car, { steer: Math.sin(i / 40), throttle: 0.4, brake: 0 }, DT);
      const moved = Math.atan2(next.y - car.y, next.x - car.x);
      const mid = car.heading + (next.heading - car.heading) / 2;
      expect(angle_between(moved, mid)).toBeLessThan(1e-3);
      car = next;
    }
  });

  test("the outer front corner swings wide of the rear wheels' path", () => {
    const car = at_full_lock(Gear.DRIVE);
    const centre = turn_centre(car)!;
    const [front_left, , rear_right, rear_left] = corners(car);
    const rear_wheel_outer = wheels(car)[2].at;
    expect(distance(front_left, centre)).toBeGreaterThan(distance(rear_left, centre));
    expect(distance(front_left, centre)).toBeGreaterThan(5.3);
    expect(distance(rear_right, centre)).toBeLessThan(distance(rear_wheel_outer, centre));
  });

  test("inner front wheel turns more than the outer one (Ackermann)", () => {
    const car = at_full_lock(Gear.DRIVE);
    const [outer, inner] = wheels(car);
    expect(inner.angle).toBeGreaterThan(outer.angle);
    expect(inner.angle).toBeGreaterThan(car.steer);
    expect(outer.angle).toBeLessThan(car.steer);
  });

  test("reversing on the same lock retraces the same circle the other way", () => {
    const forward = at_full_lock(Gear.DRIVE);
    const centre = turn_centre(forward)!;
    const back = run({ ...forward, gear: Gear.REVERSE }, { steer: 1, throttle: 0, brake: 0 }, 3);
    expect(back.speed).toBeLessThan(0);
    expect(back.heading).toBeLessThan(forward.heading);
    expect(distance(back, centre)).toBeCloseTo(distance(forward, centre), 3);
  });

  test("steering right turns right: on screen, y down, the heading grows clockwise", () => {
    const car = run({ ...create_car(START), gear: Gear.DRIVE }, { steer: 1, throttle: 0, brake: 0 }, 2);
    expect(car.heading).toBeGreaterThan(0);
    expect(car.y).toBeGreaterThan(0);
  });
});

describe("steering wheel", () => {
  test("turns at a limited rate: lock takes the configured time", () => {
    const parked = create_car(START);
    const half = run(parked, { steer: 1, throttle: 0, brake: 0 }, HATCHBACK.steer_time / 2);
    expect(half.steer).toBeCloseTo(max_steer(HATCHBACK) / 2, 2);
    const full = run(parked, { steer: 1, throttle: 0, brake: 0 }, HATCHBACK.steer_time + 0.05);
    expect(full.steer).toBeCloseTo(max_steer(HATCHBACK), 6);
  });

  test("let go, it stays put at a standstill and self-centres while rolling", () => {
    const locked = at_full_lock(Gear.DRIVE);
    const still = run({ ...locked, gear: Gear.PARK }, NO_INPUT, 1);
    expect(still.steer).toBeCloseTo(locked.steer, 6);
    const rolling = run(locked, NO_INPUT, 3);
    expect(Math.abs(rolling.steer)).toBeLessThan(0.01);
  });
});

describe("gears and pedals", () => {
  test("creeps in D with no pedals, like an automatic", () => {
    const car = run({ ...create_car(START), gear: Gear.DRIVE }, NO_INPUT, 6);
    expect(car.speed).toBeGreaterThan(0.8);
    expect(car.speed).toBeLessThan(HATCHBACK.creep_speed);
    expect(car.x).toBeGreaterThan(2);
  });

  test("creeps backwards in R", () => {
    const car = run({ ...create_car(START), gear: Gear.REVERSE }, NO_INPUT, 4);
    expect(car.speed).toBeLessThan(0);
    expect(car.x).toBeLessThan(0);
  });

  test("the brake holds the car against the creep", () => {
    const car = run({ ...create_car(START), gear: Gear.DRIVE }, { steer: null, throttle: 0, brake: 1 }, 3);
    expect(car.x).toBeLessThan(0.01);
  });

  test("throttle tops out at the gear's limit", () => {
    const fast = run({ ...create_car(START), gear: Gear.DRIVE }, { steer: null, throttle: 1, brake: 0 }, 30);
    expect(fast.speed).toBeLessThanOrEqual(HATCHBACK.max_forward);
    expect(fast.speed).toBeGreaterThan(HATCHBACK.max_forward * 0.8);
    const back = run({ ...create_car(START), gear: Gear.REVERSE }, { steer: null, throttle: 1, brake: 0 }, 30);
    expect(back.speed).toBeGreaterThanOrEqual(-HATCHBACK.max_reverse);
  });

  test("N and P don't drive; P is refused while moving", () => {
    const rolling = run({ ...create_car(START), gear: Gear.DRIVE }, { steer: null, throttle: 1, brake: 0 }, 2);
    expect(shift(rolling, Gear.PARK)).toBe(rolling);
    const coasting = run(shift(rolling, Gear.NEUTRAL), NO_INPUT, 1);
    expect(coasting.speed).toBeLessThan(rolling.speed);
    const stopped = run(coasting, { steer: null, throttle: 0, brake: 1 }, 3);
    const parked = shift(stopped, Gear.PARK);
    expect(parked.gear).toBe(Gear.PARK);
    expect(run(parked, { steer: null, throttle: 1, brake: 0 }, 1).x).toBeCloseTo(parked.x, 9);
  });

  test("is deterministic", () => {
    const input = { steer: 0.4, throttle: 0.5, brake: 0 };
    const a = run({ ...create_car(START), gear: Gear.DRIVE }, input, 5);
    const b = run({ ...create_car(START), gear: Gear.DRIVE }, input, 5);
    expect(a).toEqual(b);
  });
});
