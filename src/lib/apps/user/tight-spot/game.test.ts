import { describe, expect, test } from "vitest";
import {
  advance,
  ANY,
  better,
  change_gear,
  crash_title,
  create_game,
  JACKKNIFE,
  level_round,
  LEVEL_COUNT,
  Mode,
  obstacles,
  open_round,
  parked_in,
  scenario_round,
  SCENARIO_INFO,
  set_status,
  spec_of,
  stars,
  Status,
  unlocked,
  verdict,
  type GameState,
} from "./game";
import { parked_poses } from "./planner";
import { bounds_of } from "./geometry";
import { beep_period, End, sensor, sensor_frame, SENSOR_RANGE } from "./sensors";
import { corners, create_car, Gear, NO_INPUT, Vehicle } from "./vehicle";
import { SCENARIOS, Scenario, SolidKind } from "./world";

const DT = 1 / 120;

function driving(round = scenario_round(Scenario.GARAGE, 11)): GameState {
  return set_status(create_game(round), Status.DRIVING);
}

function park_in_bay(state: GameState): GameState {
  const pose = parked_poses(state.world.bays[0], obstacles(state.world))[0];
  return { ...state, car: { ...create_car(pose), gear: Gear.DRIVE } };
}

describe("judging", () => {
  test("parked only when inside the bay and in P", () => {
    const state = park_in_bay(driving());
    expect(verdict(state)).toBe("inside");
    expect(state.status).toBe(Status.DRIVING);
    const done = change_gear(state, Gear.PARK);
    expect(done.status).toBe(Status.PARKED);
    expect(done.bay).toBe(state.world.bays[0]);
  });

  test("P outside a bay doesn't end the round", () => {
    const state = change_gear(driving(), Gear.PARK);
    expect(state.status).toBe(Status.DRIVING);
    expect(verdict(state)).toBe("outside");
  });

  test("more than 5° off the bay is crooked", () => {
    const state = park_in_bay(driving());
    const crooked = { ...state, car: { ...state.car, heading: state.car.heading + (6 * Math.PI) / 180 } };
    expect(parked_in(crooked.car, state.world.bays[0])).toBe(false);
    expect(verdict(crooked)).not.toBe("inside");
  });

  test("a bay that must be entered nose first refuses the car backwards", () => {
    const state = park_in_bay(driving(scenario_round(Scenario.FORWARD, 4)));
    expect(parked_in(state.car, state.world.bays[0])).toBe(true);
    const turned = { ...state.car, heading: state.car.heading + Math.PI };
    expect(parked_in(turned, state.world.bays[0])).toBe(false);
  });

  test("turned round in the bay reads as facing the wrong way", () => {
    const state = park_in_bay(driving(scenario_round(Scenario.FORWARD, 4)));
    const body = corners(state.car);
    const centre = { x: body.reduce((sum, p) => sum + p.x, 0) / 4, y: body.reduce((sum, p) => sum + p.y, 0) / 4 };
    const turned = { ...state.car, x: 2 * centre.x - state.car.x, y: 2 * centre.y - state.car.y, heading: state.car.heading + Math.PI };
    expect(verdict({ ...state, car: turned })).toBe("backwards");
  });

  test("touching anything ends the round and records where", () => {
    let state = driving(scenario_round(Scenario.GARAGE, 3));
    state = change_gear(state, Gear.REVERSE);
    for (let i = 0; i < 120 * 30 && state.status === Status.DRIVING; i++) state = advance(state, { steer: null, throttle: 1, brake: 0 }, DT);
    expect(state.status).toBe(Status.CRASHED);
    expect(state.contact).not.toBeNull();
    expect(state.hit?.kind).toBeDefined();
  });

  test("the clock runs only while driving", () => {
    const ready = create_game(scenario_round(Scenario.GARAGE, 3));
    expect(advance(ready, NO_INPUT, DT)).toBe(ready);
    const moved = advance(set_status(ready, Status.DRIVING), NO_INPUT, 0.5);
    expect(moved.ms).toBeCloseTo(500, 6);
  });
});

describe("moves", () => {
  test("count changes between D and R, not the first gear or N and P", () => {
    let state = driving();
    state = change_gear(state, Gear.DRIVE);
    expect(state.moves).toBe(0);
    state = change_gear(state, Gear.REVERSE);
    state = change_gear(state, Gear.NEUTRAL);
    state = change_gear(state, Gear.REVERSE);
    expect(state.moves).toBe(1);
    state = change_gear(state, Gear.DRIVE);
    expect(state.moves).toBe(2);
  });

  test("stars from moves against the scenario's par", () => {
    const round = scenario_round(Scenario.PARALLEL, 1);
    expect(stars(round, 2)).toBe(3);
    expect(stars(round, 4)).toBe(2);
    expect(stars(round, 5)).toBe(1);
  });

  test("better: fewer moves first, then time", () => {
    expect(better(undefined, { moves: 9, ms: 1 })).toBe(true);
    expect(better({ moves: 2, ms: 9000 }, { moves: 1, ms: 20000 })).toBe(true);
    expect(better({ moves: 1, ms: 9000 }, { moves: 1, ms: 9500 })).toBe(false);
  });
});

describe("rounds", () => {
  test("Any picks a scenario from the seed; the same seed always gives the same round", () => {
    expect(scenario_round(ANY, 77)).toEqual(scenario_round(ANY, 77));
    const seen = new Set(Array.from({ length: 60 }, (_, i) => scenario_round(ANY, i).scenario));
    expect(seen.size).toBe(SCENARIOS.length);
  });

  test("levels cover every scenario and get harder", () => {
    const rounds = Array.from({ length: LEVEL_COUNT }, (_, i) => level_round(i + 1));
    expect(new Set(rounds.map((round) => round.scenario)).size).toBe(SCENARIOS.length);
    expect(rounds[0].difficulty).toBe(0);
    expect(rounds[LEVEL_COUNT - 1].difficulty).toBe(1);
    expect(rounds.every((round) => round.mode === Mode.LEVELS)).toBe(true);
  });

  test("unlocking runs one past the highest level parked", () => {
    expect(unlocked({})).toBe(1);
    expect(unlocked({ 1: 3, 2: 1 })).toBe(3);
    expect(unlocked({ [LEVEL_COUNT]: 2 })).toBe(LEVEL_COUNT);
    expect(unlocked({ x: 3, 2: 1 })).toBe(3);
  });

  test("open lot has no single scenario", () => {
    const state = create_game(open_round(5));
    expect(state.round.scenario).toBeNull();
    expect(state.world.chunks).toHaveLength(9);
  });
});

describe("sensors", () => {
  test("read the gap to the wall ahead in the garage", () => {
    const state = park_in_bay(driving(scenario_round(Scenario.GARAGE, 21)));
    const front = sensor(state.car, obstacles(state.world), End.FRONT);
    expect(front).not.toBeNull();
    expect(front!).toBeLessThan(0.85);
    expect(sensor(state.car, obstacles(state.world), End.REAR)).toBeNull();
  });

  test("ignore things beside the car and beyond range", () => {
    const near = {
      solids: [{ kind: SolidKind.WALL, shape: [{ x: 10, y: -5 }, { x: 11, y: -5 }, { x: 11, y: 5 }, { x: 10, y: 5 }] }],
      bounds: [{ x0: 10, y0: -5, x1: 11, y1: 5 }],
    };
    const close = { x: 10 - 3.5 - 0.5, y: 0, heading: 0 };
    expect(sensor(close, near, End.FRONT)).toBeCloseTo(0.5, 6);
    expect(sensor({ ...close, x: close.x - SENSOR_RANGE - 0.1 }, near, End.FRONT)).toBeNull();
    expect(sensor({ ...close, y: 3 }, near, End.FRONT)).toBeCloseTo(0.5, 6);
    expect(sensor({ x: 5, y: 0, heading: Math.PI / 2 }, near, End.FRONT)).toBeNull();
  });

  test("beeps faster the closer, steady at the end", () => {
    expect(beep_period(0.2)).toBe(0);
    expect(beep_period(0.5)).toBeLessThan(beep_period(1.2));
  });

  test("towing, the rear reading comes from the trailer's tail", () => {
    const state = driving(scenario_round(Scenario.DRIVEWAY, 5));
    const spec = spec_of(state.round);
    const tail = 0.6;
    const back = sensor_frame(state.car, End.REAR, spec);
    const wall = { x: back.pose.x - Math.cos(back.pose.heading) * (back.bumper + tail), y: back.pose.y - Math.sin(back.pose.heading) * (back.bumper + tail) };
    const across = { x: -Math.sin(back.pose.heading) * 3, y: Math.cos(back.pose.heading) * 3 };
    const thin = { x: -Math.cos(back.pose.heading) * 0.2, y: -Math.sin(back.pose.heading) * 0.2 };
    const shape = [
      { x: wall.x - across.x, y: wall.y - across.y },
      { x: wall.x + across.x, y: wall.y + across.y },
      { x: wall.x + across.x + thin.x, y: wall.y + across.y + thin.y },
      { x: wall.x - across.x + thin.x, y: wall.y - across.y + thin.y },
    ];
    const near = { solids: [{ kind: SolidKind.WALL, shape }], bounds: [bounds_of(shape)] };
    expect(sensor(state.car, near, End.REAR, spec)).toBeCloseTo(tail, 6);
  });
});

describe("vehicles", () => {
  test("each kind's seed picks one of its vehicles; the open lot is always the hatchback", () => {
    for (const scenario of SCENARIOS) {
      const seen = new Set(Array.from({ length: 40 }, (_, seed) => scenario_round(scenario, seed).vehicle));
      expect([...seen].sort()).toEqual([...SCENARIO_INFO[scenario].vehicles].sort());
    }
    expect(open_round(9).vehicle).toBe(Vehicle.HATCH);
  });

  test("a trailer folded past 70° ends the round at the coupling", () => {
    const state = driving(scenario_round(Scenario.SLIPWAY, 3));
    const car = { ...state.car, gear: Gear.REVERSE, trailer: { heading: state.car.heading - 1.3, roll: [0, 0] as [number, number] } };
    const next = advance({ ...state, car }, NO_INPUT, DT);
    expect(next.status).toBe(Status.CRASHED);
    expect(next.hit?.kind).toBe(JACKKNIFE);
    expect(crash_title(next.hit)).toBe("Jackknifed the trailer");
  });

  test("parked with a trailer needs the trailer lined up too", () => {
    const state = driving(scenario_round(Scenario.DRIVEWAY, 8));
    const spec = spec_of(state.round);
    const bay = state.world.bays[0];
    const pose = parked_poses(bay, obstacles(state.world), 0.05, spec)[0];
    expect(parked_in(pose, bay, spec)).toBe(true);
    expect(parked_in({ ...pose, trailer: { heading: pose.heading + 0.15, roll: [0, 0] } }, bay, spec)).toBe(false);
  });
});
