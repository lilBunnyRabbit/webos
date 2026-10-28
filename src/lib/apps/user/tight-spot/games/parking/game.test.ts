import { describe, expect, test } from "vitest";
import {
  advance,
  ANY,
  best_of,
  better,
  bests_schema,
  change_gear,
  crash_title,
  create_game,
  JACKKNIFE,
  level_round,
  LEVEL_COUNT,
  Mode,
  open_round,
  parked_in,
  PERFECT,
  precision,
  record_best,
  round_key,
  scenario_round,
  SCENARIO_INFO,
  set_status,
  spec_of,
  stars,
  Status,
  unlocked,
  verdict,
  vehicles_for,
  type GameState,
} from "./game";
import { obstacles } from "../../core/obstacles";
import { parked_poses } from "./poses";
import { bounds_of } from "../../core/geometry";
import { beep_period, End, sensor, sensor_frame, SENSOR_RANGE } from "../../core/sensors";
import { corners, create_car, Gear, NO_INPUT, pose_from_centre, Vehicle, VEHICLES, type Placement } from "../../core/vehicle";
import { centroid } from "../../core/geometry";
import { SCENARIOS, Scenario, SolidKind } from "./world";

const DT = 1 / 120;

function driving(round = scenario_round(Scenario.GARAGE, 11, undefined, Vehicle.HATCH)): GameState {
  return set_status(create_game(round), Status.DRIVING);
}

function park_in_bay(state: GameState): GameState {
  const spec = spec_of(state.round);
  const pose = parked_poses(state.world.bays[0], obstacles(state.world), 0.05, spec)[0];
  return { ...state, car: { ...create_car(pose, Gear.PARK, spec), gear: Gear.DRIVE } };
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
    const state = park_in_bay(driving(scenario_round(Scenario.FORWARD, 4, undefined, Vehicle.HATCH)));
    expect(parked_in(state.car, state.world.bays[0])).toBe(true);
    const turned = { ...state.car, heading: state.car.heading + Math.PI };
    expect(parked_in(turned, state.world.bays[0])).toBe(false);
  });

  test("turned round in the bay reads as facing the wrong way", () => {
    const state = park_in_bay(driving(scenario_round(Scenario.FORWARD, 4, undefined, Vehicle.HATCH)));
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

  test("a level picks its vehicle from what its kind had when the ladder was laid out", () => {
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      const round = level_round(level);
      const info = SCENARIO_INFO[round.scenario!];
      expect(info.ladder ?? info.vehicles, `level ${level}`).toContain(round.vehicle);
    }
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
  test("each kind's seed picks one of its vehicles; the open lot stays the hatchback", () => {
    for (const scenario of SCENARIOS) {
      const seen = new Set(Array.from({ length: 40 }, (_, seed) => scenario_round(scenario, seed).vehicle));
      expect([...seen].sort()).toEqual([...SCENARIO_INFO[scenario].vehicles].sort());
    }
    const open = new Set(Array.from({ length: 40 }, (_, seed) => open_round(seed).vehicle));
    expect([...open]).toEqual([Vehicle.HATCH]);
    expect(open_round(4, ANY).vehicle).toBe(Vehicle.HATCH);
    expect(vehicles_for(null)).toContain(Vehicle.TOWING);
  });

  test("a picked vehicle wins when the kind allows it; the seed still makes the rest", () => {
    const picked = scenario_round(Scenario.PARALLEL, 31, undefined, Vehicle.VAN);
    expect(picked.vehicle).toBe(Vehicle.VAN);
    expect({ ...picked, vehicle: null }).toEqual({ ...scenario_round(Scenario.PARALLEL, 31), vehicle: null });
    expect(scenario_round(Scenario.PARALLEL, 31, undefined, Vehicle.BUS).vehicle).toBe(scenario_round(Scenario.PARALLEL, 31).vehicle);
    expect(scenario_round(ANY, 31, "2026-10-28", Vehicle.VAN)).toEqual(scenario_round(ANY, 31, "2026-10-28"));
    expect(open_round(4, Vehicle.TOWING).vehicle).toBe(Vehicle.TOWING);
    expect(open_round(4, Vehicle.BUS).vehicle).toBe(Vehicle.HATCH);
    expect(create_game(open_round(4, Vehicle.TOWING)).car.trailer).toBeDefined();
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

describe("precision", () => {
  const round = scenario_round(Scenario.REVERSE, 12, undefined, Vehicle.HATCH);
  const bay = create_game(round).world.bays[0];
  const centre = centroid(bay.shape);

  function placed(side: number, depth: number, turn: number): Placement {
    const along = { x: Math.cos(bay.heading), y: Math.sin(bay.heading) };
    const at = { x: centre.x + along.x * depth - along.y * side, y: centre.y + along.y * depth + along.x * side };
    return pose_from_centre({ ...at, heading: bay.heading + turn });
  }

  test("dead centre and square is 100", () => {
    const fit = precision(placed(0, 0, 0), bay);
    expect(fit.score).toBeCloseTo(100, 6);
    expect(fit.side).toBeCloseTo(0, 6);
    expect(fit.depth).toBeCloseTo(0, 6);
  });

  test("reads the offsets back in metres and radians", () => {
    const fit = precision(placed(0.1, -0.2, 0), bay);
    expect(fit.side).toBeCloseTo(0.1, 6);
    expect(fit.depth).toBeCloseTo(0.2, 6);
    expect(precision(placed(0, 0, 0.02), bay).angle).toBeCloseTo(0.02, 6);
  });

  test("falls to nothing at the edge of what the bay allows", () => {
    const across = { x: -Math.sin(bay.heading), y: Math.cos(bay.heading) };
    const spans = bay.shape.map((p) => (p.x - centre.x) * across.x + (p.y - centre.y) * across.y);
    const room = (Math.max(...spans) - Math.min(...spans) - VEHICLES.hatch.width) / 2;
    expect(precision(placed(room - 0.005, 0, 0), bay).score).toBeLessThan(5);
    expect(precision(placed(0, 0, (5 * Math.PI) / 180), bay).score).toBeLessThan(1);
  });

  test("worse the further off, on every axis", () => {
    for (const make of [(k: number) => placed(k * 0.03, 0, 0), (k: number) => placed(0, k * 0.03, 0), (k: number) => placed(0, 0, k * 0.005)]) {
      const scores = Array.from({ length: 8 }, (_, k) => precision(make(k), bay).score);
      for (let k = 1; k < scores.length; k++) expect(scores[k]).toBeLessThan(scores[k - 1]);
    }
  });

  test("either way round counts the same in a bay that allows both", () => {
    const either = { ...bay, either: true };
    const turned = placed(0.05, 0.1, Math.PI);
    expect(precision(turned, either).score).toBeCloseTo(precision(placed(-0.05, -0.1, 0), either).score, 6);
  });

  test("a trailer is judged with the car: centring over the rig, the worse of the two angles", () => {
    const towing = scenario_round(Scenario.DRIVEWAY, 8);
    const state = create_game(towing);
    const spec = VEHICLES[towing.vehicle];
    const rig_bay = state.world.bays[0];
    const pose = parked_poses(rig_bay, obstacles(state.world), 0.05, spec)[0];
    const straight = precision(pose, rig_bay, spec);
    const bent = precision({ ...pose, trailer: { heading: pose.heading + 0.03, roll: [0, 0] } }, rig_bay, spec);
    expect(bent.angle).toBeCloseTo(Math.max(0.03, straight.angle), 6);
    expect(bent.score).toBeLessThan(straight.score);
  });

  test("perfect is 95 or more", () => {
    expect(precision(placed(0.01, 0.01, 0.001), bay).score).toBeGreaterThanOrEqual(PERFECT);
  });
});

describe("bests", () => {
  const hatch = scenario_round(Scenario.PARALLEL, 1, undefined, Vehicle.HATCH);
  const van = { ...hatch, vehicle: Vehicle.VAN };

  test("keyed per kind and vehicle", () => {
    expect(round_key(van)).toBe("parallel:van");
    expect(round_key(open_round(3, Vehicle.PICKUP))).toBe("open:pickup");
    const bests = bests_schema.parse({ "parallel:hatch": { moves: 2, ms: 9000 } });
    expect(best_of(bests, hatch)).toEqual({ moves: 2, ms: 9000 });
    expect(best_of(bests, van)).toBeUndefined();
  });

  test("order stays moves then time; precision only rises", () => {
    let bests = record_best({}, van, { moves: 3, ms: 9000, precision: 90 }).bests;
    const better_run = record_best(bests, van, { moves: 2, ms: 12000, precision: 60 });
    expect(better_run.improved).toBe(true);
    bests = better_run.bests;
    expect(bests["parallel:van"]).toEqual({ moves: 2, ms: 12000, precision: 90 });
    bests = record_best(bests, van, { moves: 4, ms: 1000, precision: 97 }).bests;
    expect(bests["parallel:van"]).toEqual({ moves: 2, ms: 12000, precision: 97 });
    expect(bests_schema.safeParse(bests).success).toBe(true);
  });
});
