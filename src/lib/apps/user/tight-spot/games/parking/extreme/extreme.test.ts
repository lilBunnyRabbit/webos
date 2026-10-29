import { describe, expect, test } from "vitest";
import { create_car, Gear, VEHICLES } from "../../../core/vehicle";
import { support } from "../../../core/support";
import { advance, crash_title, create_game, extreme_round, OFF, round_key, set_status, Status } from "../game";
import { COURSES, courses_open } from "./courses";

const DT = 1 / 120;

describe("extreme", () => {
  test("every course starts with every tyre on the ground", () => {
    for (const course of COURSES) {
      const state = create_game(extreme_round(course.id));
      expect(support(state.car, VEHICLES[course.vehicle], state.world.ground), course.id).toEqual([]);
    }
  });

  test("a wheel off the plank ends the round, named after the plank", () => {
    let state = set_status(create_game(extreme_round("planks")), Status.DRIVING);
    state = { ...state, car: { ...create_car({ x: 0, y: -3, heading: -Math.PI / 2 }, Gear.DRIVE), speed: 1, steer: 0.5 } };
    for (let i = 0; i < 600 && state.status === Status.DRIVING; i++) state = advance(state, { steer: 1, throttle: 0.4, brake: 0 }, DT);
    expect(state.status).toBe(Status.CRASHED);
    expect(state.hit?.kind).toBe(OFF);
    expect(crash_title(state.hit)).toBe("Off the plank");
  });

  test("the next course opens once one is parked, its best kept apart", () => {
    expect(courses_open({})).toBe(1);
    expect(courses_open({ [COURSES[0].id]: 2 })).toBe(2);
    expect(courses_open(Object.fromEntries(COURSES.map((course) => [course.id, 3])))).toBe(COURSES.length);
    expect(round_key(extreme_round("planks"))).toBe("extreme:planks");
  });
});
