import { describe, expect, test } from "vitest";
import { angle_between } from "./geometry";
import {
  axles,
  bodies,
  corners,
  create_car,
  DriveKind,
  folds,
  FORKLIFT,
  FRAME_RAMP,
  grip_lock,
  front_frame,
  Gear,
  GT_CAR,
  HATCHBACK,
  HATCH_TRAILER,
  hitch_angles,
  headings,
  hitch_point,
  jackknife,
  jackknifed,
  max_steer,
  MOTORCYCLE,
  NO_INPUT,
  REAR_STEER,
  rig_ends,
  rig_length,
  set_crab,
  shift,
  steer_base,
  SteerAxle,
  step,
  steer_boost,
  STEER_BOOST,
  trailer_pose,
  trailer_poses,
  travel,
  turn_centre,
  VEHICLES,
  wheels,
  without_creep,
  type Car,
  type Input,
  type VehicleSpec,
  type Wheel,
} from "./vehicle";
import { plan } from "./planner";

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

  test("a held key winding back from the other side eases up to the boost; turning toward a side never does", () => {
    expect(steer_boost(0, true)).toBe(1);
    expect(steer_boost(0.2, true)).toBe(1);
    expect(steer_boost(0.4, true)).toBeGreaterThan(1);
    expect(steer_boost(0.4, true)).toBeLessThan(STEER_BOOST);
    expect(steer_boost(0.6, true)).toBeCloseTo(STEER_BOOST, 6);
    expect(steer_boost(5, true)).toBeCloseTo(STEER_BOOST, 6);
    for (let t = 0; t < 1; t += 0.01) expect(steer_boost(t + 0.01, true)).toBeGreaterThanOrEqual(steer_boost(t, true));
    expect(steer_boost(5, false)).toBe(1);
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
  test("full lock gives its kerb-to-kerb turning radius at the outer steered wheel", () => {
    for (const spec of Object.values(VEHICLES)) {
      const car = run(
        { ...create_car(START, Gear.DRIVE, spec) },
        { steer: 1, throttle: 0, brake: 1 },
        spec.steer_time + 0.2,
        spec
      );
      expect(car.steer).toBeCloseTo(max_steer(spec), 6);
      const centre = turn_centre(car, spec)!;
      const all = wheels(car, spec);
      if (spec.drive.kind === DriveKind.SKID) {
        expect(distance(centre, car)).toBeCloseTo(0, 9);
        continue;
      }
      const outer = Math.max(distance(all[0].at, centre), distance(all[2].at, centre));
      const rear_steer = spec.drive.kind === DriveKind.ACKERMANN && spec.drive.steer_axle === SteerAxle.REAR;
      expect(rear_steer ? distance(all[2].at, centre) : outer, `${spec.length}`).toBeCloseTo(spec.turning_radius, 2);
    }
  });
});

describe("GT car", () => {
  test("pulls past 30 m/s in under ten seconds, tops out under its cap, and stops from there in under four", () => {
    const flat_out = { steer: null, throttle: 1, brake: 0 };
    const quick = run({ ...create_car(START), gear: Gear.DRIVE }, flat_out, 10, GT_CAR);
    expect(quick.speed).toBeGreaterThan(30);
    const top = run(quick, flat_out, 30, GT_CAR);
    expect(top.speed).toBeLessThanOrEqual(GT_CAR.max_forward);
    expect(top.speed).toBeGreaterThan(35);
    const stopped = run(top, { steer: null, throttle: 0, brake: 1 }, 4, GT_CAR);
    expect(stopped.speed).toBe(0);
  });

  test("turns a coupé's circle, much tighter than the F1 car's", () => {
    expect(GT_CAR.turning_radius * 2).toBeGreaterThan(11);
    expect(GT_CAR.turning_radius * 2).toBeLessThan(12);
    expect(max_steer(GT_CAR)).toBeGreaterThan(max_steer(VEHICLES.f1));
  });
});

describe("motorcycle", () => {
  test("turns tighter than any car, both wheels on the centre line, and is only paddled backwards", () => {
    expect(MOTORCYCLE.turning_radius).toBeLessThan(VEHICLES.city.turning_radius);
    for (const wheel of wheels(create_car(START, Gear.DRIVE, MOTORCYCLE), MOTORCYCLE)) expect(wheel.at.y).toBeCloseTo(0, 9);
    const backing = run({ ...create_car(START), gear: Gear.REVERSE }, { steer: null, throttle: 1, brake: 0 }, 5, MOTORCYCLE);
    expect(Math.abs(backing.speed)).toBeLessThanOrEqual(MOTORCYCLE.max_reverse);
  });

  test("past 30 m/s flat out, its steering capped at speed", () => {
    const top = run({ ...create_car(START), gear: Gear.DRIVE }, { steer: null, throttle: 1, brake: 0 }, 15, MOTORCYCLE);
    expect(top.speed).toBeGreaterThan(30);
    const leaning = run(top, { steer: 1, throttle: 0, brake: 0 }, 1, MOTORCYCLE);
    expect(leaning.steer).toBeLessThan(max_steer(MOTORCYCLE) * 0.2);
  });
});

describe("speed-limited steering", () => {
  const held = (spec: VehicleSpec, speed: number) =>
    run({ ...create_car(START, Gear.DRIVE, spec), speed }, { steer: 1, throttle: 0, brake: 0 }, 1.5, spec);

  test("a GT car at 30 m/s holds the turn to what its tyres take, far from full lock", () => {
    const car = held(GT_CAR, 30);
    const v = car.speed;
    expect(car.steer).toBeLessThan(max_steer(GT_CAR) * 0.2);
    expect((Math.tan(car.steer) / steer_base(GT_CAR)) * v * v).toBeLessThanOrEqual(GT_CAR.a_lat! + 1e-6);
    expect(held(GT_CAR, 4).steer).toBeCloseTo(max_steer(GT_CAR), 9);
  });

  test("a vehicle without a_lat keeps full lock at any speed", () => {
    expect(HATCHBACK.a_lat).toBeUndefined();
    expect(held(HATCHBACK, 8).steer).toBeCloseTo(max_steer(HATCHBACK), 9);
    expect(grip_lock(40, HATCHBACK)).toBe(max_steer(HATCHBACK));
  });

  test("a skid steer keeps its full lock at speed, a_lat or not", () => {
    const bobcat = { ...VEHICLES.bobcat, a_lat: 7 };
    expect(held(bobcat, bobcat.max_forward).steer).toBe(1);
  });

  test("a frame steer's tighter axle turns at most a_lat / v²", () => {
    const spec = { ...VEHICLES.dumper, a_lat: 7 };
    const drive = spec.drive;
    if (drive.kind !== DriveKind.FRAME) throw new Error("the dumper is frame-steered");
    const v = 12;
    const bend = grip_lock(v, spec);
    expect(bend).toBeLessThan(max_steer(spec));
    const short = Math.min(drive.pivot, spec.wheelbase - drive.pivot);
    const radius = ((spec.wheelbase - short) * Math.cos(bend) + short) / Math.sin(bend);
    expect((v * v) / radius).toBeCloseTo(7, 6);
  });
});

describe("trailer", () => {
  const spec = HATCH_TRAILER;
  const DEG = Math.PI / 180;

  function towing(hitch: number, gear: Gear): Car {
    const car = create_car(START, gear, spec);
    return { ...car, trailers: [{ ...car.trailers![0], heading: -hitch }] };
  }

  test("starts straight behind the car", () => {
    const car = create_car(START, Gear.PARK, spec);
    expect(car.trailers?.[0].heading).toBe(START.heading);
    expect(hitch_angles(car)[0]).toBe(0);
  });

  test("towing forwards straightens it", () => {
    const car = run(towing(30 * DEG, Gear.DRIVE), { steer: 0, throttle: 0.5, brake: 0 }, 6, spec);
    expect(car.x).toBeGreaterThan(8);
    expect(Math.abs(hitch_angles(car)[0])).toBeLessThan(2 * DEG);
  });

  test("reversing amplifies the hitch angle, and past 70° it has jackknifed", () => {
    const start = towing(5 * DEG, Gear.REVERSE);
    let car = start;
    let previous = Math.abs(hitch_angles(car)[0]);
    for (let i = 0; i < 120 * 4; i++) {
      car = step(car, { steer: 0, throttle: 0.5, brake: 0 }, DT, spec);
      expect(Math.abs(hitch_angles(car)[0])).toBeGreaterThanOrEqual(previous - 1e-12);
      previous = Math.abs(hitch_angles(car)[0]);
    }
    expect(Math.abs(hitch_angles(car)[0])).toBeGreaterThan(10 * DEG);
    for (let i = 0; i < 120 * 20 && !jackknifed(car, spec); i++)
      car = step(car, { steer: 0, throttle: 0.5, brake: 0 }, DT, spec);
    expect(jackknifed(car, spec)).toBe(true);
  });

  test("the trailer's axle never slides sideways", () => {
    let car = run(towing(0, Gear.DRIVE), { steer: 0.8, throttle: 0.5, brake: 0 }, 1, spec);
    for (let i = 0; i < 300; i++) {
      const next = step(car, { steer: Math.sin(i / 30), throttle: 0.5, brake: 0 }, DT, spec);
      const a = trailer_pose(car, spec);
      const b = trailer_pose(next, spec);
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
    for (const rolled of straight.trailers![0].roll) expect(rolled).toBeCloseTo(straight.x, 6);
    const turning = run(towing(0, Gear.DRIVE), { steer: 1, throttle: 0.4, brake: 0 }, 6, spec);
    const [left, right] = turning.trailers![0].roll;
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

describe("hitch chain", () => {
  const DEG = Math.PI / 180;
  const box = HATCH_TRAILER.hitches[0];
  const spec: VehicleSpec = {
    ...HATCH_TRAILER,
    hitches: [box, { ...box, hitch: 1.4, max_angle: 60 * DEG }, { ...box, hitch: 1.4, axle: 3, max_angle: 50 * DEG }],
  };

  function bent(angles: number[], gear: Gear): Car {
    const car = create_car(START, gear, spec);
    let heading = START.heading;
    return { ...car, trailers: car.trailers!.map((trailer, i) => ({ ...trailer, heading: (heading -= angles[i]) })) };
  }

  test("starts straight behind the vehicle, every link a body", () => {
    const car = create_car(START, Gear.PARK, spec);
    expect(car.trailers).toHaveLength(3);
    expect(hitch_angles(car)).toEqual([0, 0, 0]);
    expect(bodies(car, spec)).toHaveLength(4);
    const tail = Math.min(...bodies(car, spec)[3].map((p) => p.x));
    expect(rig_ends(spec).rear).toBeCloseTo(tail, 9);
  });

  test("the first link moves exactly as a lone trailer does", () => {
    const input = { steer: 0.7, throttle: 0.5, brake: 0 };
    const single = create_car(START, Gear.REVERSE, HATCH_TRAILER);
    const lone = run({ ...single, trailers: [{ ...single.trailers![0], heading: -10 * DEG }] }, input, 3, HATCH_TRAILER);
    const chain = run(bent([10 * DEG, 0, 0], Gear.REVERSE), input, 3, spec);
    expect(chain.trailers![0]).toEqual(lone.trailers![0]);
  });

  test("towing forwards straightens every link", () => {
    const car = run(bent([25 * DEG, -30 * DEG, 20 * DEG], Gear.DRIVE), { steer: 0, throttle: 0.5, brake: 0 }, 10, spec);
    expect(car.x).toBeGreaterThan(15);
    for (const angle of hitch_angles(car)) expect(Math.abs(angle)).toBeLessThan(2 * DEG);
  });

  test("reversing makes the hinges diverge until one folds past its limit", () => {
    let car = bent([1 * DEG, -1 * DEG, 1 * DEG], Gear.REVERSE);
    const start = Math.max(...hitch_angles(car).map(Math.abs));
    for (let i = 0; i < 120 * 3; i++) car = step(car, { steer: 0, throttle: 0.5, brake: 0 }, DT, spec);
    expect(Math.max(...hitch_angles(car).map(Math.abs))).toBeGreaterThan(start * 3);
    for (let i = 0; i < 120 * 30 && !jackknifed(car, spec); i++) car = step(car, { steer: 0, throttle: 0.5, brake: 0 }, DT, spec);
    expect(jackknife(car, spec)).toBeGreaterThanOrEqual(0);
  });

  test("every link's axle only moves along its heading", () => {
    let car = run(bent([0, 0, 0], Gear.DRIVE), { steer: 0.8, throttle: 0.5, brake: 0 }, 1, spec);
    for (let i = 0; i < 400; i++) {
      const next = step(car, { steer: Math.sin(i / 30), throttle: 0.5, brake: 0 }, DT, spec);
      for (let k = 0; k < 3; k++) {
        const a = trailer_pose(car, spec, k);
        const b = trailer_pose(next, spec, k);
        const moved = Math.hypot(b.x - a.x, b.y - a.y);
        const mid = (a.heading + b.heading) / 2;
        const sideways = Math.abs(-(b.x - a.x) * Math.sin(mid) + (b.y - a.y) * Math.cos(mid));
        expect(sideways, `link ${k}`).toBeLessThan(moved * 2e-3 + 1e-9);
      }
      car = next;
    }
  });

  test("each hinge has its own limit, and the first one past it is the one that jackknifed", () => {
    expect(jackknife(bent([65 * DEG, 0, 0], Gear.PARK), spec)).toBe(-1);
    expect(jackknife(bent([0, 65 * DEG, 0], Gear.PARK), spec)).toBe(1);
    expect(jackknife(bent([0, 0, -55 * DEG], Gear.PARK), spec)).toBe(2);
    expect(jackknife(bent([75 * DEG, 65 * DEG, 0], Gear.PARK), spec)).toBe(0);
    expect(hitch_point(bent([0, 0, 0], Gear.PARK), spec, 1).x).toBeCloseTo(-(box.hitch + box.axle + 1.4), 9);
  });

  test("is deterministic, and a step of no time changes nothing", () => {
    const input = { steer: -0.6, throttle: 0.5, brake: 0 };
    const a = run(bent([5 * DEG, -5 * DEG, 5 * DEG], Gear.REVERSE), input, 2, spec);
    const b = run(bent([5 * DEG, -5 * DEG, 5 * DEG], Gear.REVERSE), input, 2, spec);
    expect(a).toEqual(b);
    expect(step(a, input, 0, spec)).toBe(a);
    expect(step(a, input, -0.01, spec)).toBe(a);
  });
});

describe("rest angle", () => {
  const DEG = Math.PI / 180;
  // A tug facing a towed body hung off its front: the hinge 2.4 m ahead of its rear axle, the body's axle 6 m further on.
  const spec: VehicleSpec = {
    ...VEHICLES.baggage,
    hitches: [
      {
        hitch: -2.4,
        axle: 6,
        drawbar: 1,
        box_length: 8,
        width: 3,
        track: 2.4,
        wheel_diameter: 0.8,
        wheel_width: 0.3,
        max_angle: 60 * DEG,
        rest: Math.PI,
      },
    ],
  };

  function swung(fold: number): Car {
    const car = create_car(START, Gear.PARK, spec);
    return { ...car, trailers: [{ ...car.trailers![0], heading: START.heading - Math.PI - fold }] };
  }

  test("a link at rest π hangs ahead of the vehicle, placed or created", () => {
    const car = create_car(START, Gear.PARK, spec);
    for (const pose of [trailer_pose(car, spec), trailer_poses(START, spec)[0]]) {
      expect(pose.x).toBeCloseTo(8.4, 9);
      expect(angle_between(pose.heading, Math.PI)).toBeLessThan(1e-12);
    }
    expect(folds(car, spec)).toEqual([0]);
    expect(rig_ends(spec).front).toBeCloseTo(11.4, 9);
    expect(rig_ends(spec).rear).toBeCloseTo(-VEHICLES.baggage.rear_overhang, 9);
  });

  test("pushing straight keeps it at rest, ahead of the vehicle", () => {
    const car = run(
      { ...create_car(START, Gear.PARK, spec), gear: Gear.DRIVE },
      { steer: 0, throttle: 0.5, brake: 0 },
      4,
      spec
    );
    expect(car.x).toBeGreaterThan(3);
    expect(Math.abs(folds(car, spec)[0])).toBeLessThan(1e-9);
    expect(trailer_pose(car, spec).x).toBeCloseTo(car.x + 8.4, 6);
  });

  test("it jackknifes past max_angle either side of rest", () => {
    expect(jackknife(swung(55 * DEG), spec)).toBe(-1);
    expect(jackknife(swung(-55 * DEG), spec)).toBe(-1);
    expect(jackknife(swung(65 * DEG), spec)).toBe(0);
    expect(jackknife(swung(-65 * DEG), spec)).toBe(0);
  });

  test("the planner turns the rig round into a pose box", { timeout: 10_000 }, () => {
    const box = { x0: 3, x1: 5, y0: 5, y1: 7 };
    const south = -Math.PI / 2;
    const found = plan(
      create_car(START, Gear.PARK, spec),
      { x: 4, y: 6, heading: south },
      { solids: [], bounds: [] },
      {
        spec,
        max_expansions: 20_000,
        arrive: (pose) =>
          pose.x >= box.x0 &&
          pose.x <= box.x1 &&
          pose.y >= box.y0 &&
          pose.y <= box.y1 &&
          angle_between(pose.heading, south) < 10 * DEG &&
          Math.abs(folds(pose, spec)[0]) < 10 * DEG,
      }
    );
    expect(found).not.toBeNull();
    for (const pose of found!.path) expect(jackknife(pose, spec)).toBe(-1);
  });
});

describe("rear-wheel steering", () => {
  const spec: VehicleSpec = {
    ...HATCHBACK,
    drive: REAR_STEER,
    length: 2.5,
    width: 1.2,
    wheelbase: 1.5,
    rear_overhang: 0.55,
    track: 0.95,
    turning_radius: 1.68,
  };

  function locked(gear: Gear): Car {
    return run(create_car(START, gear, spec), { steer: 1, throttle: 0, brake: 1 }, spec.steer_time + 0.2, spec);
  }

  test("the pose is the front axle, and the rear wheels steer the opposite way to the turn", () => {
    expect(axles(spec)).toEqual({ front: 0, rear: -1.5 });
    const car = locked(Gear.DRIVE);
    const [front_left, front_right, rear_left, rear_right] = wheels(car, spec);
    expect(front_left.angle).toBe(0);
    expect(front_right.angle).toBe(0);
    expect(rear_left.angle).toBeLessThan(0);
    expect(rear_right.angle).toBeLessThan(rear_left.angle);
    expect(distance(front_left.at, car)).toBeCloseTo(spec.track / 2, 9);
  });

  test("full lock gives its turning radius at the outer rear wheel, and the front axle turns on a fixed circle", () => {
    let car = locked(Gear.DRIVE);
    expect(car.steer).toBeCloseTo(max_steer(spec), 6);
    expect((max_steer(spec) * 180) / Math.PI).toBeGreaterThan(75);
    const centre = turn_centre(car, spec)!;
    expect(distance(wheels(car, spec)[2].at, centre)).toBeCloseTo(spec.turning_radius, 2);
    const radius = spec.wheelbase / Math.tan(max_steer(spec));
    for (let i = 0; i < 2000; i++) {
      car = step(car, { steer: 1, throttle: 0, brake: 0 }, DT, spec);
      expect(distance(car, centre)).toBeCloseTo(radius, 3);
    }
  });

  test("steering right turns right, and the front axle only moves along the heading", () => {
    let car = run(create_car(START, Gear.DRIVE, spec), { steer: 1, throttle: 0.5, brake: 0 }, 2, spec);
    expect(car.heading).toBeGreaterThan(0);
    expect(car.y).toBeGreaterThan(0);
    for (let i = 0; i < 400; i++) {
      const next = step(car, { steer: Math.sin(i / 40), throttle: 0.4, brake: 0 }, DT, spec);
      const moved = Math.atan2(next.y - car.y, next.x - car.x);
      const mid = car.heading + (next.heading - car.heading) / 2;
      if (distance(next, car) > 1e-6) expect(angle_between(moved, mid)).toBeLessThan(1e-3);
      car = next;
    }
  });

  test("the tail swings out wider than anything at the front", () => {
    const car = locked(Gear.DRIVE);
    const centre = turn_centre(car, spec)!;
    const [front_left, front_right, rear_right, rear_left] = corners(car, spec);
    const tail = distance(rear_left, centre);
    expect(tail).toBeGreaterThan(distance(front_left, centre));
    expect(tail).toBeGreaterThan(distance(front_right, centre));
    expect(tail).toBeGreaterThan(distance(wheels(car, spec)[2].at, centre));
    expect(distance(rear_right, centre)).toBeGreaterThan(distance(front_right, centre));
  });

  test("on lock each wheel rolls the length of its own arc, the outer rear the most", () => {
    const start = locked(Gear.DRIVE);
    const centre = turn_centre(start, spec)!;
    const radii = wheels(start, spec).map((wheel) => distance(wheel.at, centre));
    let car = start;
    for (let i = 0; i < 600; i++) car = step(car, { steer: 1, throttle: 0, brake: 0 }, DT, spec);
    const turned = car.heading - start.heading;
    car.roll.forEach((rolled, i) => expect(rolled - start.roll[i]).toBeCloseTo(radii[i] * turned, 6));
    expect(Math.max(...car.roll)).toBe(car.roll[2]);
    const straight = run(create_car(START, Gear.DRIVE, spec), { steer: 0, throttle: 0.6, brake: 0 }, 2, spec);
    for (const rolled of straight.roll) expect(rolled).toBeCloseTo(straight.x, 9);
  });

  test("is deterministic, and a step of no time changes nothing", () => {
    const input = { steer: -0.7, throttle: 0.5, brake: 0 };
    const a = run(create_car(START, Gear.REVERSE, spec), input, 3, spec);
    const b = run(create_car(START, Gear.REVERSE, spec), input, 3, spec);
    expect(a).toEqual(b);
    expect(step(a, input, 0, spec)).toBe(a);
    expect(step(a, input, -0.01, spec)).toBe(a);
  });
});

describe("forklift", () => {
  test("steers its rear wheels to about 80° and is 2.5 m long with 1.2 m forks out ahead", () => {
    const lock = (max_steer(FORKLIFT) * 180) / Math.PI;
    expect(lock).toBeGreaterThan(78);
    expect(lock).toBeLessThan(82);
    expect(rig_length(FORKLIFT)).toBeCloseTo(3.7, 9);
    const [body, forks] = bodies(START, FORKLIFT);
    expect(Math.max(...body.map((p) => p.x))).toBeCloseTo(0.45, 9);
    expect(Math.min(...body.map((p) => p.x))).toBeCloseTo(-2.05, 9);
    expect(Math.min(...forks.map((p) => p.x))).toBeCloseTo(0.45, 9);
    expect(Math.max(...forks.map((p) => p.x))).toBeCloseTo(1.65, 9);
  });

  test("tops out at a walking pace and a bit", () => {
    const fast = run(create_car(START, Gear.DRIVE, FORKLIFT), { steer: null, throttle: 1, brake: 0 }, 20, FORKLIFT);
    expect(fast.speed).toBeLessThanOrEqual(3);
    expect(fast.speed).toBeGreaterThan(2.4);
  });
});

describe("all-wheel steer", () => {
  const spec = VEHICLES.ladder;

  test("the rear wheels counter-steer, so the turn centre sits level with the middle and the circle is tighter", () => {
    const car = run(create_car(START, Gear.DRIVE, spec), { steer: 1, throttle: 0, brake: 1 }, 3, spec);
    const [fl, , rl] = wheels(car, spec);
    expect(fl.angle).toBeGreaterThan(0);
    expect(rl.angle).toBeCloseTo(-fl.angle, 9);
    expect(steer_base(spec)).toBe(spec.wheelbase / 2);
    const four = 1 / (Math.tan(max_steer(spec)) / steer_base(spec));
    const two = 1 / (Math.tan(max_steer(spec)) / spec.wheelbase);
    expect(four).toBeCloseTo(two / 2, 9);
  });

  test("the middle of the wheelbase only moves along the heading", () => {
    let car = run(create_car(START, Gear.DRIVE, spec), { steer: 0.6, throttle: 0.5, brake: 0 }, 1, spec);
    for (let i = 0; i < 300; i++) {
      const next = step(car, { steer: Math.sin(i / 30), throttle: 0.5, brake: 0 }, DT, spec);
      const moved = Math.atan2(next.y - car.y, next.x - car.x);
      expect(angle_between(moved, (car.heading + next.heading) / 2)).toBeLessThan(1e-3);
      car = next;
    }
  });
});

describe("crab steer", () => {
  const spec = VEHICLES.telehandler;

  test("only a vehicle with a crab mode switches, and only near a standstill", () => {
    const parked = create_car(START, Gear.DRIVE, spec);
    expect(set_crab(parked, true, spec).crab).toBe(true);
    expect(set_crab(parked, true, VEHICLES.ladder)).toBe(parked);
    expect(set_crab({ ...parked, speed: 2 }, true, spec).crab).toBeUndefined();
  });

  test("slides along its wheels without turning, every wheel at the same angle", () => {
    const car = set_crab(create_car(START, Gear.DRIVE, spec), true, spec);
    const moved = run(car, { steer: 1, throttle: 1, brake: 0 }, 3, spec);
    expect(moved.heading).toBe(START.heading);
    const way = Math.atan2(moved.y, moved.x);
    expect(way).toBeGreaterThan(0.2);
    expect(way).toBeLessThanOrEqual(max_steer(spec) + 1e-9);
    expect(new Set(wheels(moved, spec).map((wheel) => wheel.angle)).size).toBe(1);
    expect(turn_centre(moved, spec)).toBeNull();
  });

  test("out of crab mode it turns like an all-wheel steer", () => {
    const car = run(create_car(START, Gear.DRIVE, spec), { steer: 1, throttle: 0.5, brake: 0 }, 2, spec);
    expect(car.heading).toBeGreaterThan(0.2);
  });
});

describe("skid steer", () => {
  const spec = VEHICLES.bobcat;
  const track = 1.6;

  test("full lock spins it on the spot, the tracks running against each other", () => {
    const locked = run(create_car(START, Gear.PARK, spec), { steer: 1, throttle: 0, brake: 0 }, 1, spec);
    const car = run({ ...locked, gear: Gear.DRIVE }, { steer: 1, throttle: 1, brake: 0 }, 2, spec);
    expect(Math.hypot(car.x, car.y)).toBeLessThan(1e-9);
    expect(car.heading).toBeGreaterThan(1);
    expect(car.roll[0]).toBeGreaterThan(0);
    expect(car.roll[1]).toBeCloseTo(-car.roll[0], 9);
    expect(distance(turn_centre(car, spec)!, car)).toBeLessThan(1e-9);
  });

  test("half lock turns about the inner track, which stands still", () => {
    let car = run(create_car(START, Gear.PARK, spec), { steer: 0.5, throttle: 0, brake: 1 }, 1, spec);
    car = { ...car, gear: Gear.DRIVE, speed: 1, brake: 0 };
    const centre = turn_centre(car, spec)!;
    expect(distance(centre, car)).toBeCloseTo(track / 2, 9);
    const before = car.roll[1];
    car = run(car, { steer: 0.5, throttle: 0.4, brake: 0 }, 1, spec);
    expect(distance(car, centre)).toBeCloseTo(track / 2, 6);
    expect(car.roll[1]).toBeCloseTo(before, 9);
  });

  test("straight it drives like anything else; in P the wheel spins nothing", () => {
    const ahead = run(create_car(START, Gear.DRIVE, spec), { steer: 0, throttle: 1, brake: 0 }, 1, spec);
    expect(ahead.heading).toBe(0);
    expect(ahead.x).toBeGreaterThan(0.3);
    const parked = run(create_car(START, Gear.PARK, spec), { steer: 1, throttle: 1, brake: 0 }, 1, spec);
    expect(parked.heading).toBe(0);
    expect(parked.x).toBe(0);
  });

  test("the mower pivots about its drive wheels, the deck swinging round", () => {
    const mower = VEHICLES.mower;
    expect(axles(mower)).toEqual({ front: 0, rear: -0 });
    const locked = run(create_car(START, Gear.PARK, mower), { steer: -1, throttle: 0, brake: 0 }, 1, mower);
    const car = run({ ...locked, gear: Gear.DRIVE }, { steer: -1, throttle: 1, brake: 0 }, 1, mower);
    expect(Math.hypot(car.x, car.y)).toBeLessThan(1e-9);
    expect(car.heading).toBeLessThan(-0.5);
  });
});

describe("frame steer", () => {
  const spec = VEHICLES.loader;
  const DEG = Math.PI / 180;

  function bent(side = 1): Car {
    return run(create_car(START, Gear.PARK, spec), { steer: side, throttle: 0, brake: 1 }, spec.steer_time + 0.3, spec);
  }

  function middle(a: Wheel, b: Wheel) {
    return { x: (a.at.x + b.at.x) / 2, y: (a.at.y + b.at.y) / 2 };
  }

  test("the wheel bends the joint up to its lock: about 40° for the loader, 47° for the dump truck", () => {
    const car = bent();
    expect(car.steer).toBeCloseTo(max_steer(spec), 9);
    expect(max_steer(spec) / DEG).toBeCloseTo(40, 0);
    expect(max_steer(VEHICLES.dumper) / DEG).toBeGreaterThan(44);
    expect(max_steer(VEHICLES.dumper) / DEG).toBeLessThan(50);
  });

  test("bending at a standstill swings both frames about their axles, which stay put", () => {
    const before = wheels(create_car(START, Gear.DRIVE, spec), spec);
    const car = bent();
    const after = wheels(car, spec);
    expect(distance(middle(after[2], after[3]), middle(before[2], before[3]))).toBeLessThan(1e-9);
    expect(car.heading).toBeLessThan(-5 * DEG);
    expect(car.heading + car.steer).toBeGreaterThan(5 * DEG);
  });

  test("neither axle slides sideways while it drives and bends", () => {
    let car = run(create_car(START, Gear.DRIVE, spec), { steer: 0.5, throttle: 0.6, brake: 0 }, 1, spec);
    for (let i = 0; i < 300; i++) {
      const next = step(car, { steer: Math.sin(i / 25), throttle: 0.6, brake: 0 }, DT, spec);
      const rear = Math.atan2(next.y - car.y, next.x - car.x);
      expect(angle_between(rear, (car.heading + next.heading) / 2)).toBeLessThan(2e-3);
      const a = front_frame(car, spec);
      const b = front_frame(next, spec);
      const along = Math.atan2(b.y - a.y, b.x - a.x);
      expect(Math.abs(Math.sin(along - (a.heading + b.heading) / 2))).toBeLessThan(2e-3);
      car = next;
    }
  });

  test("held bent, the rear axle circles the turn centre", () => {
    let car: Car = { ...bent(), gear: Gear.DRIVE, brake: 0 };
    const centre = turn_centre(car, spec)!;
    const radius = distance(car, centre);
    for (let i = 0; i < 600; i++) {
      car = step(car, { steer: 1, throttle: 0.3, brake: 0 }, DT, spec);
      expect(distance(car, centre)).toBeCloseTo(radius, 3);
    }
  });

  test("two frames are two bodies; the front one must line up too", () => {
    const car = bent();
    expect(bodies(car, spec)).toHaveLength(2);
    expect(headings(car, spec)).toEqual([car.heading, car.heading + car.steer]);
    expect(headings(START, HATCHBACK)).toEqual([0]);
  });

  test("travel bends the joint as it rolls, at FRAME_RAMP per metre", () => {
    expect(travel({ ...START, steer: 0 }, 1, 0.4, spec).steer).toBeCloseTo(0.4 * FRAME_RAMP, 9);
    expect(travel({ ...START, steer: 0.3 }, 0.3, 2, spec).steer).toBe(0.3);
  });
});

describe("skid, frame, all-wheel and crab steer", () => {
  test("are deterministic, and a step of no time changes nothing", () => {
    for (const id of ["bobcat", "mower", "tank", "loader", "dumper", "ladder", "telehandler"] as const) {
      const spec = VEHICLES[id];
      const input = { steer: -0.7, throttle: 0.5, brake: 0 };
      const parked = create_car(START, Gear.REVERSE, spec);
      const start = id === "telehandler" ? set_crab(parked, true, spec) : parked;
      const a = run(start, input, 3, spec);
      const b = run(start, input, 3, spec);
      expect(a, id).toEqual(b);
      expect(step(a, input, 0, spec)).toBe(a);
      expect(step(a, input, -0.01, spec)).toBe(a);
    }
  });
});
