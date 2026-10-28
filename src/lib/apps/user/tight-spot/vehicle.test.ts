import { describe, expect, test } from "vitest";
import { angle_between } from "./geometry";
import {
  corners,
  create_car,
  Gear,
  HATCHBACK,
  HATCH_TRAILER,
  hitch_angle,
  jackknifed,
  max_steer,
  NO_INPUT,
  shift,
  step,
  steer_boost,
  STEER_BOOST,
  trailer_pose,
  turn_centre,
  VEHICLES,
  wheels,
  without_creep,
  type Car,
  type Input,
  type VehicleSpec,
} from "./vehicle";

const DT = 1 / 120;
const START = { x: 0, y: 0, heading: 0 };

function run(car: Car, input: Input, seconds: number, spec: VehicleSpec = HATCHBACK): Car {
  let next = car;
  for (let i = 0; i < Math.round(seconds / DT); i++) next = step(next, input, DT, spec);
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
  test("turns at a limited rate: lock takes the steady time over the boost", () => {
    const parked = create_car(START);
    const fastest = HATCHBACK.steer_time / STEER_BOOST;
    expect(fastest).toBeCloseTo(0.69, 2);
    const half = run(parked, { steer: 1, throttle: 0, brake: 0 }, fastest / 2);
    expect(half.steer).toBeCloseTo(max_steer(HATCHBACK) / 2, 2);
    const full = run(parked, { steer: 1, throttle: 0, brake: 0 }, fastest + 0.05);
    expect(full.steer).toBeCloseTo(max_steer(HATCHBACK), 6);
  });

  test("a wheel target moved at the steady rate is followed without lag", () => {
    let car = create_car(START);
    const dt = 1 / 120;
    for (let i = 1; i <= 60; i++) {
      car = step(car, { steer: Math.min(1, (i * dt) / HATCHBACK.steer_time), throttle: 0, brake: 0 }, dt);
      expect(car.steer).toBeCloseTo(Math.min(1, (i * dt) / HATCHBACK.steer_time) * max_steer(HATCHBACK), 6);
    }
  });

  test("a held key keeps the fine rate for a short hold, then eases up to the boost", () => {
    expect(steer_boost(0)).toBe(1);
    expect(steer_boost(0.2)).toBe(1);
    expect(steer_boost(0.4)).toBeGreaterThan(1);
    expect(steer_boost(0.4)).toBeLessThan(STEER_BOOST);
    expect(steer_boost(0.6)).toBeCloseTo(STEER_BOOST, 6);
    expect(steer_boost(5)).toBeCloseTo(STEER_BOOST, 6);
    for (let t = 0; t < 1; t += 0.01) expect(steer_boost(t + 0.01)).toBeGreaterThanOrEqual(steer_boost(t));
  });

  test("hands off, the caster centres the wheel at the steady rate, not the boosted one", () => {
    const locked = at_full_lock(Gear.DRIVE);
    const rolling = { ...locked, speed: 2.5 };
    const after = step(rolling, NO_INPUT, 0.1);
    expect(locked.steer - after.steer).toBeCloseTo((max_steer(HATCHBACK) / HATCHBACK.steer_time) * 0.1, 6);
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
  test("a zero or negative step leaves the car as it was, in P too", () => {
    const car = create_car(START);
    expect(step(car, NO_INPUT, 0)).toBe(car);
    expect(step(car, NO_INPUT, -0.004)).toBe(car);
    expect(Number.isFinite(step(car, NO_INPUT, DT).speed)).toBe(true);
  });

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

  test("without creep the car only moves on the gas and rolls to a stop", () => {
    const idle = run({ ...create_car(START), gear: Gear.DRIVE }, NO_INPUT, 3, without_creep(HATCHBACK));
    expect(idle.x).toBe(START.x);
    const pushed = run(
      { ...create_car(START), gear: Gear.DRIVE },
      { steer: null, throttle: 1, brake: 0 },
      1,
      without_creep(HATCHBACK)
    );
    expect(pushed.speed).toBeGreaterThan(1);
    const rolled = run(pushed, NO_INPUT, 10, without_creep(HATCHBACK));
    expect(rolled.speed).toBe(0);
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

describe("wheel roll", () => {
  test("driving straight, every wheel rolls the distance the car covers, negative in reverse", () => {
    const forward = run({ ...create_car(START), gear: Gear.DRIVE }, { steer: 0, throttle: 0.6, brake: 0 }, 2);
    for (const rolled of forward.roll) expect(rolled).toBeCloseTo(forward.x, 9);
    const back = run({ ...create_car(START), gear: Gear.REVERSE }, { steer: 0, throttle: 0.6, brake: 0 }, 2);
    for (const rolled of back.roll) expect(rolled).toBeCloseTo(back.x, 9);
    expect(back.x).toBeLessThan(0);
  });

  test("on lock each wheel rolls the length of its own circle's arc, the outer front wheel the most", () => {
    const locked = at_full_lock(Gear.DRIVE);
    const centre = turn_centre(locked)!;
    const radii = wheels(locked).map((wheel) => distance(wheel.at, centre));
    let car = locked;
    for (let i = 0; i < 600; i++) car = step(car, { steer: 1, throttle: 0, brake: 0 }, DT);
    const turned = car.heading - locked.heading;
    car.roll.forEach((rolled, i) => expect(rolled - locked.roll[i]).toBeCloseTo(radii[i] * turned, 6));
    expect(Math.max(...car.roll)).toBe(car.roll[0]);
    expect(Math.min(...car.roll)).toBe(car.roll[3]);
  });

  test("standing still rolls nothing, even while the wheel turns", () => {
    const parked = run(create_car(START), { steer: 1, throttle: 0, brake: 0 }, 2);
    expect(parked.roll).toEqual([0, 0, 0, 0]);
  });
});

describe("every vehicle", () => {
  test("full lock gives its kerb-to-kerb turning radius at the outer front wheel", () => {
    for (const spec of Object.values(VEHICLES)) {
      const car = run(
        { ...create_car(START, Gear.DRIVE, spec) },
        { steer: 1, throttle: 0, brake: 1 },
        spec.steer_time + 0.2,
        spec
      );
      expect(car.steer).toBeCloseTo(max_steer(spec), 6);
      expect(distance(wheels(car, spec)[0].at, turn_centre(car, spec)!)).toBeCloseTo(spec.turning_radius, 2);
    }
  });
});

describe("trailer", () => {
  const spec = HATCH_TRAILER;
  const DEG = Math.PI / 180;

  function towing(hitch: number, gear: Gear): Car {
    const car = create_car(START, gear, spec);
    return { ...car, trailer: { ...car.trailer!, heading: -hitch } };
  }

  test("starts straight behind the car", () => {
    const car = create_car(START, Gear.PARK, spec);
    expect(car.trailer?.heading).toBe(START.heading);
    expect(hitch_angle(car)).toBe(0);
  });

  test("towing forwards straightens it", () => {
    const car = run(towing(30 * DEG, Gear.DRIVE), { steer: 0, throttle: 0.5, brake: 0 }, 6, spec);
    expect(car.x).toBeGreaterThan(8);
    expect(Math.abs(hitch_angle(car))).toBeLessThan(2 * DEG);
  });

  test("reversing amplifies the hitch angle, and past 70° it has jackknifed", () => {
    const start = towing(5 * DEG, Gear.REVERSE);
    let car = start;
    let previous = Math.abs(hitch_angle(car));
    for (let i = 0; i < 120 * 4; i++) {
      car = step(car, { steer: 0, throttle: 0.5, brake: 0 }, DT, spec);
      expect(Math.abs(hitch_angle(car))).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = Math.abs(hitch_angle(car));
    }
    expect(Math.abs(hitch_angle(car))).toBeGreaterThan(10 * DEG);
    for (let i = 0; i < 120 * 20 && !jackknifed(car); i++)
      car = step(car, { steer: 0, throttle: 0.5, brake: 0 }, DT, spec);
    expect(jackknifed(car)).toBe(true);
  });

  test("the trailer's axle never slides sideways", () => {
    let car = run(towing(0, Gear.DRIVE), { steer: 0.8, throttle: 0.5, brake: 0 }, 1, spec);
    for (let i = 0; i < 300; i++) {
      const next = step(car, { steer: Math.sin(i / 30), throttle: 0.5, brake: 0 }, DT, spec);
      const a = trailer_pose(car, spec.trailer!);
      const b = trailer_pose(next, spec.trailer!);
      const moved = Math.hypot(b.x - a.x, b.y - a.y);
      const sideways = Math.abs(
        -(b.x - a.x) * Math.sin((a.heading + b.heading) / 2) + (b.y - a.y) * Math.cos((a.heading + b.heading) / 2)
      );
      expect(sideways).toBeLessThan(moved * 1e-3 + 1e-9);
      car = next;
    }
  });

  test("its wheels roll the distance straight on, the outer one more round a turn", () => {
    const straight = run(towing(0, Gear.DRIVE), { steer: 0, throttle: 0.6, brake: 0 }, 2, spec);
    for (const rolled of straight.trailer!.roll) expect(rolled).toBeCloseTo(straight.x, 6);
    const turning = run(towing(0, Gear.DRIVE), { steer: 1, throttle: 0.4, brake: 0 }, 6, spec);
    const [left, right] = turning.trailer!.roll;
    expect(left).toBeGreaterThan(right);
  });

  test("is deterministic, and a step of no time changes nothing", () => {
    const input = { steer: -0.6, throttle: 0.5, brake: 0 };
    const a = run(towing(10 * DEG, Gear.REVERSE), input, 2, spec);
    const b = run(towing(10 * DEG, Gear.REVERSE), input, 2, spec);
    expect(a).toEqual(b);
    expect(step(a, input, 0, spec)).toBe(a);
  });
});
