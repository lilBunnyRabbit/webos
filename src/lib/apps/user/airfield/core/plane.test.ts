import { describe, expect, test } from "vitest";
import { advance, create_flight, CrashKind, Status } from "./flight";
import {
  airborne,
  create_plane,
  CRUISE_THROTTLE,
  DT,
  level_flight,
  measure_climb,
  measure_glide,
  measure_level,
  measure_pitch_rate,
  measure_rollout,
  measure_stall,
  measure_trim_speed,
  step_plane,
  type Input,
  type Plane,
} from "./plane";
import { PLANE_IDS, plane_coefficients, SPECS } from "./planes";

const near = (value: number, target: number, share = 0.03) => expect(Math.abs(value - target)).toBeLessThanOrEqual(Math.abs(target) * share + 1e-3);
const HANDS_OFF: Input = { throttle: 0, stick: 0, trim: 0, flaps: 0, brake: 0, facing: 1 };

describe.each(PLANE_IDS)("%s meets its feel numbers", (id) => {
  const spec = SPECS[id];
  const c = plane_coefficients(id);

  test("stall, glide, climb and cruise", () => {
    near(measure_stall(c), spec.stall_speed);
    near(measure_stall(c, 1), spec.flap_stall);
    near(measure_glide(c), spec.glide);
    near(measure_climb(c).rate, spec.climb);
    near(measure_level(c, CRUISE_THROTTLE), spec.cruise);
  });

  test("trim, pitch rate and roll-out", () => {
    near(measure_trim_speed(c), spec.trim_speed);
    near(measure_pitch_rate(c), spec.pitch_rate);
    near(measure_rollout(c), spec.rollout);
  });
});

function fly(plane: Plane, seconds: number, input: Partial<Input>, id = PLANE_IDS[0]): Plane {
  const c = plane_coefficients(id);
  for (let t = 0; t < seconds; t += DT) plane = step_plane(plane, { ...HANDS_OFF, ...input }, c, DT);
  return plane;
}

describe("handling", () => {
  const c = plane_coefficients(PLANE_IDS[0]);

  test("full throttle, hands off: the tail comes up and it flies off by itself", () => {
    let plane = create_plane(c, 0);
    let tail_up = false;
    for (let t = 0; t < 40 && !airborne(plane); t += DT) {
      plane = step_plane(plane, { ...HANDS_OFF, throttle: 1, flaps: 0.5 }, c, DT);
      if (plane.main_on && !plane.tail_on) tail_up = true;
    }
    expect(tail_up).toBe(true);
    expect(airborne(plane)).toBe(true);
    expect(plane.vx).toBeGreaterThan(spec_stall() * 1.05);
  });

  test("held full back at idle the wing stalls and the nose drops", () => {
    let plane = level_flight(c, 25).plane;
    let top = -Infinity;
    let dropped = false;
    for (let t = 0; t < 8; t += DT) {
      plane = step_plane(plane, { ...HANDS_OFF, stick: 2 }, c, DT);
      top = Math.max(top, plane.pitch);
      if (top > 0.3 && plane.pitch < top - 0.35) dropped = true;
    }
    expect(dropped).toBe(true);
  });

  test("hard brakes with the stick forward put it on its nose", () => {
    const plane = { ...create_plane(c, 0), vx: 18 };
    let flight = create_flight(plane);
    for (let t = 0; t < 8 && flight.status === Status.FLYING; t += DT) flight = advance(flight, { ...HANDS_OFF, stick: -1, brake: 1 }, c, DT);
    expect(flight.crash?.kind).toBe(CrashKind.NOSE_OVER);
  });

  test("in the air it flies the way it faces; on the ground it pivots round at taxi speed", () => {
    const start = level_flight(c, 25);
    const flown = fly(start.plane, 10, { throttle: start.throttle, trim: start.trim, stick: 0, facing: -1 });
    expect(flown.yaw).toBe(0);
    expect(flown.vz).toBe(0);
    expect(flown.vx).toBeGreaterThan(20);
    const taxied = fly(create_plane(c, 0), 8, { ...HANDS_OFF, facing: -1 });
    expect(Math.cos(taxied.yaw)).toBeLessThan(-0.99);
  });

  function spec_stall() {
    return measure_stall(c);
  }
});
