import { describe, expect, test } from "vitest";
import { collide, obstacles } from "../../core/obstacles";
import { End, sensor } from "../../core/sensors";
import { NO_INPUT, pose_from_centre, rig_ends, rig_length, Vehicle, VEHICLES, type Car } from "../../core/vehicle";
import { build_course, CONE, StepKind } from "./course";
import {
  advance,
  course_round,
  create_game,
  crossed,
  daily_round,
  DAILY_VEHICLES,
  experimental,
  SHELVES,
  knocked,
  PENALTY_MS,
  record_best,
  sensed,
  shelves_done,
  Status,
  step_done,
  total_ms,
  touched,
  data_schema,
  LEVEL_COUNT,
  level_round,
  LEVELS,
  stars,
  unlocked,
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

  test("the sensors hear a standing cone, not a knocked one", () => {
    const state = create_game(course_round(Vehicle.HATCH, 1));
    const cone = state.cones[0].at;
    const car = { ...state.car, x: cone.x - CONE / 2 - rig_ends(VEHICLES.hatch).front - 1, y: cone.y, heading: 0 };
    expect(sensor(car, sensed(state), End.FRONT, VEHICLES.hatch)).toBeCloseTo(1);
    const down = { ...state, cones: state.cones.map((each, i) => (i === 0 ? { ...each, down: { ...cone, heading: 0 } } : each)) };
    expect(sensor(car, sensed(down), End.FRONT, VEHICLES.hatch) ?? Infinity).toBeGreaterThan(1.05);
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
    const daily = record_best({}, { ...daily_round("2026-10-29", 1), vehicle: Vehicle.BUS }, { ms: 1, cones: 0 });
    expect(shelves_done(daily.bests)).toBe(1);
    expect(shelves_done({ "road-train:1": { ms: 1, cones: 0 } })).toBe(0);
  });

  test("chains of two or more links sit on the experimental shelf only", () => {
    const chains = SHELVES[SHELVES.length - 1].vehicles;
    expect(chains.length).toBeGreaterThan(0);
    expect(chains.every(experimental)).toBe(true);
    expect(SHELVES.slice(0, -1).every((shelf) => !shelf.vehicles.some(experimental))).toBe(true);
  });
});

describe("levels", () => {
  test("a level's course has its counts, and a bay too narrow to U-turn in", () => {
    LEVELS.forEach((level, i) => {
      const state = create_game(level_round(i + 1));
      const { course } = state;
      const spec = VEHICLES[level.vehicle];
      const kinds = course.steps.map((step) => step.kind);
      expect(kinds.filter((kind) => kind === StepKind.GATE)).toHaveLength(level.shape.gates);
      expect(kinds.filter((kind) => kind === StepKind.SLALOM)).toHaveLength(level.shape.cones);
      expect(kinds.includes(StepKind.TURN)).toBe(level.shape.bay);
      expect(collide(state.car, obstacles(course), spec)).toBeNull();
      if (!course.bay) return;
      expect(kinds.indexOf(StepKind.TURN)).toBe(level.shape.gates);
      const ys = course.bay.map((p) => p.y);
      expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(2 * spec.turning_radius + spec.width);
    });
  });

  // Pinned from the course builder before the levels, so a past course's bests still mean the same course.
  test("the free courses keep their layout", () => {
    const { course } = create_game(course_round(Vehicle.HATCH, 3));
    const r = (n: number) => Math.round(n * 1000) / 1000;
    expect(course.bay).toBeNull();
    expect([r(course.bounds.x1), r(course.bounds.y1), course.steps.length]).toEqual([77.301, 26.551, 9]);
    expect(course.steps.filter((step) => step.gate).map((step) => [r(step.gate!.a.x), r(step.gate!.a.y)])).toEqual([
      [17.606, 4.398],
      [30.883, 6.739],
      [42.181, 5.535],
      [55.308, 20.321],
      [43.272, 20.321],
      [31.235, 20.321],
      [19.199, 20.321],
      [8.537, 19.256],
    ]);
    expect(course.box.map((p) => [r(p.x), r(p.y)])).toEqual([
      [2.4, 19.001],
      [7.353, 19.001],
      [7.353, 21.64],
      [2.4, 21.64],
    ]);
  });

  test("the bay counts turned round with the whole rig inside", () => {
    const { course } = create_game(level_round(5));
    const step = course.steps.find((each) => each.kind === StepKind.TURN)!;
    const xs = step.box!.map((p) => p.x);
    const ys = step.box!.map((p) => p.y);
    const spec = VEHICLES.hatch;
    const inside = pose_from_centre({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, heading: Math.PI }, spec);
    expect(step_done(step, inside, inside, 0, spec)).toBe(true);
    expect(step_done(step, inside, { ...inside, heading: Math.PI / 2 }, 0, spec)).toBe(false);
    expect(step_done(step, inside, { ...inside, x: Math.min(...xs) }, 0, spec)).toBe(false);
  });

  test("stars: done, no cone down, the time with cones at or under par", () => {
    const done = { ...create_game(level_round(1)), status: Status.DONE, ms: 40_000 };
    const one_down = { ...done, cones: done.cones.map((cone, i) => (i === 0 ? { ...cone, down: { ...cone.at, heading: 0 } } : cone)) };
    expect(stars(done, 40_000)).toBe(3);
    expect(stars(done, null)).toBe(2);
    expect(stars(one_down, 50_000)).toBe(2);
    expect(stars(one_down, 44_000)).toBe(1);
    expect(stars({ ...done, status: Status.CRASHED }, 40_000)).toBe(0);
  });

  test("a level keeps its most stars, then its quickest, and opens the next", () => {
    const round = level_round(2);
    const first = record_best({}, round, { ms: 50_000, cones: 0, stars: 2 });
    expect(Object.keys(first.bests)).toEqual(["level:2"]);
    expect(first.bests["level:2"].vehicle).toBe(round.vehicle);
    expect(record_best(first.bests, round, { ms: 40_000, cones: 1, stars: 1 }).improved).toBe(false);
    expect(record_best(first.bests, round, { ms: 60_000, cones: 0, stars: 3 }).improved).toBe(true);
    expect(unlocked({})).toBe(1);
    expect(unlocked({ 1: 1, 2: 3 })).toBe(3);
    expect(unlocked({ [LEVEL_COUNT]: 3 })).toBe(LEVEL_COUNT);
  });

  test("an old save without levels still reads", () => {
    expect(data_schema.parse({ bests: { "hatch:1": { ms: 1, cones: 0 } } }).levels).toEqual({});
  });
});
