import { describe, expect, test } from "vitest";
import type { Pose } from "../../core/geometry";
import { body_ends, Gear, type Placement } from "../../core/vehicle";
import {
  advance,
  can_lift,
  change_gear,
  crash_title,
  create_game,
  FULL_GAP,
  fork_action,
  fork_fit,
  fork_hint,
  ForkAction,
  JAM,
  level_round,
  LEVEL_COUNT,
  load_pose,
  offset_of,
  par_moves,
  placed_in,
  record_best,
  set_status,
  SPEC,
  stars,
  Status,
  task_line,
  unlocked,
  use_fork,
  type GameState,
} from "./game";
import { PALLET } from "./warehouse";

const DEG = Math.PI / 180;
const MAST = body_ends(SPEC).front;

// The forklift on the pallet's axis line, `turn` off it about the pallet's centre, `side` across.
function at_pallet(pallet: Pose, gap = 0.05, side = 0, turn = 0): Placement {
  const heading = pallet.heading + turn;
  const along = { x: Math.cos(heading), y: Math.sin(heading) };
  const across = { x: -along.y, y: along.x };
  const back = PALLET.length / 2 + MAST + gap;
  return { x: pallet.x - along.x * back + across.x * side, y: pallet.y - along.y * back + across.y * side, heading };
}

function driving(state: GameState, pose: Placement): GameState {
  return { ...set_status(state, Status.DRIVING), car: { ...state.car, ...pose, speed: 0, gear: Gear.DRIVE } };
}

describe("forks", () => {
  const pallet = { x: 10, y: 5, heading: -Math.PI / 2 };

  test("fully in and square lifts; short of the face, or more than 5° off, doesn't", () => {
    expect(can_lift(fork_fit(at_pallet(pallet), pallet))).toBe(true);
    expect(fork_fit(at_pallet(pallet), pallet).gap).toBeCloseTo(0.05, 9);
    expect(can_lift(fork_fit(at_pallet(pallet, FULL_GAP + 0.05), pallet))).toBe(false);
    expect(can_lift(fork_fit(at_pallet(pallet, 0.05, 0, 4 * DEG), pallet))).toBe(true);
    expect(can_lift(fork_fit(at_pallet(pallet, 0.05, 0, 6 * DEG), pallet))).toBe(false);
  });

  test("a carried pallet keeps the offset it was picked up with", () => {
    const car = at_pallet(pallet, 0.05, 0.04, 2 * DEG);
    const offset = offset_of(car, pallet);
    const back = load_pose(car, offset);
    expect(back.x).toBeCloseTo(pallet.x, 9);
    expect(back.y).toBeCloseTo(pallet.y, 9);
    expect(back.heading).toBeCloseTo(pallet.heading, 9);
  });
});

describe("a job", () => {
  const start = create_game(level_round(1));
  const task = start.floor.tasks[0];

  test("starts ready, the forklift parked at the charger, no pallet in hand", () => {
    expect(start.status).toBe(Status.READY);
    expect(start.car.gear).toBe(Gear.PARK);
    expect(start.loads.every((load) => !load.carried && !load.placed)).toBe(true);
    expect(task_line(start)).toBe(`Pallet 1/1 · pick up at ${task.from.name}`);
  });

  test("lift with the forks in, carry, lower inside the target: the job is done with its precision", () => {
    let state = driving(start, at_pallet(task.from.home));
    expect(fork_action(state)).toBe(ForkAction.LIFT);
    state = use_fork(state);
    expect(state.loads[0].carried).not.toBeNull();
    expect(task_line(state)).toBe(`Pallet 1/1 → ${task.to.name}`);
    expect(fork_action(state)).toBeNull();
    const offset = state.loads[0].carried!;
    const target = task.to.home;
    const over = { x: target.x - Math.cos(target.heading) * offset.x, y: target.y - Math.sin(target.heading) * offset.x, heading: target.heading };
    state = { ...state, car: { ...state.car, ...over } };
    expect(placed_in(load_pose(state.car, offset), task.to)).toBe(true);
    expect(fork_action(state)).toBe(ForkAction.LOWER);
    state = use_fork(state);
    expect(state.status).toBe(Status.DONE);
    expect(state.loads[0].placed).toBe(true);
    expect(state.drops).toHaveLength(1);
    expect(state.drops[0].score).toBeGreaterThan(95);
  });

  test("the Fork control is off while moving, and says why when it's off at a pallet", () => {
    const moving = { ...driving(start, at_pallet(task.from.home)), car: { ...driving(start, at_pallet(task.from.home)).car, speed: 0.4 } };
    expect(fork_action(moving)).toBeNull();
    expect(fork_hint(driving(start, at_pallet(task.from.home, 0.6)))).toBe("Drive the forks fully in");
    expect(fork_hint(driving(start, at_pallet(task.from.home, 0.05, 0, 6.5 * DEG)))).toMatch(/^Not square: 6\.5° off$/);
  });

  test("forks off the pockets jam; the body touching a pallet is a contact", () => {
    const pallet = task.from.home;
    const jammed = driving(start, at_pallet(pallet, 0.3, 0, 12 * DEG));
    const after = advance(jammed, { steer: 0, throttle: 0, brake: 0 }, 1 / 120);
    expect(after.status).toBe(Status.CRASHED);
    expect(after.hit?.kind).toBe(JAM);
    expect(crash_title(after.hit)).toBe("Jammed the forks into a pallet");
    const clean = advance(driving(start, at_pallet(pallet, 0.3)), { steer: 0, throttle: 0, brake: 0 }, 1 / 120);
    expect(clean.status).toBe(Status.DRIVING);
    const rammed = advance(driving(start, at_pallet(pallet, -0.1)), { steer: 0, throttle: 0, brake: 0 }, 1 / 120);
    expect(rammed.hit).toEqual({ kind: "pallet", by_load: false });
  });

  test("moves count changes between D and R, the first gear not counted", () => {
    let state = set_status(start, Status.DRIVING);
    state = change_gear(state, Gear.REVERSE);
    state = change_gear(state, Gear.DRIVE);
    state = change_gear(state, Gear.REVERSE);
    expect(state.moves).toBe(2);
  });
});

describe("scoring", () => {
  const done = { status: Status.DONE, round: level_round(5), ms: 60_000 } as const;

  test("a star for the job, one for the moves at par, one for the time at par", () => {
    expect(par_moves(1)).toBe(3);
    expect(par_moves(4)).toBe(18);
    expect(stars({ ...done, moves: par_moves(2) }, 60_000)).toBe(3);
    expect(stars({ ...done, moves: par_moves(2) + 1 }, 60_000)).toBe(2);
    expect(stars({ ...done, moves: par_moves(2) + 1 }, 50_000)).toBe(1);
    expect(stars({ ...done, moves: 0 }, null)).toBe(2);
    expect(stars({ ...done, status: Status.CRASHED, moves: 0 }, 60_000)).toBe(0);
  });

  test("a best is more stars, then quicker; precision only rises", () => {
    const round = level_round(3);
    let bests = record_best({}, round, { stars: 2, ms: 50_000, precision: 90 }).bests;
    expect(record_best(bests, round, { stars: 2, ms: 60_000, precision: 97 }).improved).toBe(false);
    bests = record_best(bests, round, { stars: 2, ms: 60_000, precision: 97 }).bests;
    expect(bests["level:3"]).toEqual({ stars: 2, ms: 50_000, precision: 97 });
    const faster = record_best(bests, round, { stars: 3, ms: 90_000, precision: 80 });
    expect(faster.improved).toBe(true);
    expect(faster.bests["level:3"]).toEqual({ stars: 3, ms: 90_000, precision: 97 });
  });

  test("levels run one to four pallets, tighter as they go, each opening the next", () => {
    expect(LEVEL_COUNT).toBe(16);
    expect(level_round(1).size).toBe(1);
    expect(level_round(16).size).toBe(4);
    expect(level_round(16).difficulty).toBe(1);
    expect(level_round(2).difficulty).toBeGreaterThan(level_round(1).difficulty);
    expect(unlocked({})).toBe(1);
    expect(unlocked({ 1: 3, 2: 1 })).toBe(3);
  });
});
