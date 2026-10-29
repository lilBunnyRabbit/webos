import { describe, expect, test } from "vitest";
import { collide, obstacles } from "../../core/obstacles";
import { NO_INPUT, rig_ends, rig_length, Vehicle, VEHICLES, type Car } from "../../core/vehicle";
import { build_course, StepKind } from "./course";
import {
  advance,
  course_round,
  create_game,
  crossed,
  daily_round,
  DAILY_VEHICLES,
  knocked,
  PENALTY_MS,
  record_best,
  shelves_done,
  Status,
  step_done,
  total_ms,
  touched,
  type GameState,
} from "./game";

const forward = { steer: 0, throttle: 1, brake: 0 };

function driving(state: GameState, car: Partial<Car>): GameState {
  return { ...state, status: Status.DRIVING, car: { ...state.car, gear: "D", ...car } };
}

describe("the course", () => {
  test("a seed and a vehicle build the same course", () => {
    expect(build_course(7, VEHICLES.hatch)).toEqual(build_course(7, VEHICLES.hatch));
  });

  test("it grows with the vehicle", () => {
    const small = build_course(7, VEHICLES.hatch).bounds;
    const big = build_course(7, VEHICLES.bus).bounds;
    expect(big.x1).toBeGreaterThan(small.x1);
    expect(big.y1).toBeGreaterThan(small.y1);
  });

  test("gates, a slalom, the stop box and the reverse gate, in that order", () => {
    const kinds = build_course(3, VEHICLES.van).steps.map((step) => step.kind);
    expect(kinds.slice(0, 3)).toEqual([StepKind.GATE, StepKind.GATE, StepKind.GATE]);
    expect(kinds.slice(-2)).toEqual([StepKind.STOP, StepKind.REVERSE]);
    expect(kinds.filter((kind) => kind === StepKind.SLALOM).length).toBeGreaterThanOrEqual(4);
  });

  test("every vehicle starts clear of the fence and every cone, with the box longer than the rig", () => {
    for (const vehicle of Object.values(Vehicle)) {
      const state = create_game(course_round(vehicle, 2));
      const spec = VEHICLES[vehicle];
      expect(collide(state.car, obstacles(state.course), spec), vehicle).toBeNull();
      expect(touched(state.cones, state.car, spec), vehicle).toEqual([]);
      const xs = state.course.box.map((p) => p.x);
      expect(Math.max(...xs) - Math.min(...xs), vehicle).toBeGreaterThan(rig_length(spec));
    }
  });

  test("the daily fixes the course and deals no chain of two links or more", () => {
    expect(daily_round("2026-10-29", 99)).toEqual(daily_round("2026-10-29", 99));
    expect(DAILY_VEHICLES.every((each) => VEHICLES[each].hitches.length <= 1)).toBe(true);
  });
});

describe("judging", () => {
  const gate = { a: { x: 10, y: 0 }, b: { x: 10, y: 4 }, normal: { x: 1, y: 0 } };

  test("a gate counts crossed between its ends, along its normal only", () => {
    expect(crossed(gate, { x: 9.8, y: 2 }, { x: 10.2, y: 2 })).toBe(true);
    expect(crossed(gate, { x: 10.2, y: 2 }, { x: 9.8, y: 2 })).toBe(false);
    expect(crossed(gate, { x: 9.8, y: 5 }, { x: 10.2, y: 5 })).toBe(false);
    expect(crossed(gate, { x: 9.8, y: 1 }, { x: 9.9, y: 1 })).toBe(false);
  });

  test("the reverse gate only counts backing up", () => {
    const step = { kind: StepKind.REVERSE, gate };
    const spec = VEHICLES.hatch;
    const front = rig_ends(spec).front;
    const was = { x: 9.9 + front, y: 2, heading: Math.PI };
    const now = { x: 10.1 + front, y: 2, heading: Math.PI };
    expect(step_done(step, was, now, -1, spec)).toBe(true);
    expect(step_done(step, was, now, 1, spec)).toBe(false);
  });

  test("the stop box counts standing with the whole rig inside", () => {
    const state = create_game(course_round(Vehicle.HATCH, 1));
    const step = state.course.steps.find((each) => each.kind === StepKind.STOP)!;
    const xs = step.box!.map((p) => p.x);
    const ys = step.box!.map((p) => p.y);
    const inside = { x: Math.max(...xs) - 0.4 - 0.9, y: (Math.min(...ys) + Math.max(...ys)) / 2, heading: Math.PI };
    expect(step_done(step, inside, inside, 0, VEHICLES.hatch)).toBe(true);
    expect(step_done(step, inside, inside, 1, VEHICLES.hatch)).toBe(false);
    const out = { ...inside, x: Math.max(...xs) + 1 };
    expect(step_done(step, out, out, 0, VEHICLES.hatch)).toBe(false);
  });

  test("a knocked cone adds five seconds and the run goes on", () => {
    const state = create_game(course_round(Vehicle.HATCH, 1));
    const cone = state.cones[0].at;
    const next = advance(driving(state, { x: cone.x - 3.6, y: cone.y, heading: 0, speed: 2 }), forward, 0.1, VEHICLES.hatch);
    expect(next.status).toBe(Status.DRIVING);
    expect(knocked(next)).toBe(1);
    expect(total_ms(next)).toBeCloseTo(next.ms + PENALTY_MS);
    const again = advance(next, forward, 0.1, VEHICLES.hatch);
    expect(knocked(again)).toBe(1);
  });

  test("the fence ends the run", () => {
    const state = create_game(course_round(Vehicle.HATCH, 1));
    const next = advance(driving(state, { x: state.course.bounds.x1 - 3.7, y: state.course.middle, heading: 0, speed: 2 }), forward, 0.1, VEHICLES.hatch);
    expect(next.status).toBe(Status.CRASHED);
    expect(next.contact).not.toBeNull();
  });

  test("nothing moves before the start", () => {
    const state = create_game(course_round(Vehicle.HATCH, 1));
    expect(advance(state, NO_INPUT, 0.1, VEHICLES.hatch)).toBe(state);
  });
});

describe("bests", () => {
  test("per vehicle and course, quicker wins", () => {
    const round = course_round(Vehicle.BUS, 3);
    const first = record_best({}, round, { ms: 60_000, cones: 1 });
    expect(first.first).toBe(true);
    expect(Object.keys(first.bests)).toEqual(["bus:3"]);
    const slower = record_best(first.bests, round, { ms: 61_000, cones: 0 });
    expect(slower.improved).toBe(false);
    const quicker = record_best(first.bests, round, { ms: 50_000, cones: 2 });
    expect(quicker.bests["bus:3"]).toEqual({ ms: 50_000, cones: 2 });
  });

  test("the shelves a finished vehicle is on", () => {
    expect(shelves_done({ "hatch:1": { ms: 1, cones: 0 }, "van:2": { ms: 1, cones: 0 }, "bobcat:1": { ms: 1, cones: 0 }, "daily:2026-10-29": { ms: 1, cones: 0 } })).toBe(2);
  });
});
