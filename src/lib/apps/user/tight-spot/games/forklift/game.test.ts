import { describe, expect, test } from "vitest";
import type { Pose } from "../../core/geometry";
import { body_ends, Gear, type Placement } from "../../core/vehicle";
import {
  advance,
  along,
  can_lift,
  change_gear,
  BUMP_CLEAR,
  BUMP_COST_MS,
  bump_flash,
  bump_hint,
  create_game,
  FULL_GAP,
  fork_action,
  fork_fit,
  fork_hint,
  in_pockets,
  ForkAction,
  FORK_ROOM,
  JAM_SIDE,
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
  carried_pose,
  drop_fit,
  settle_raised,
  SideKind,
  type GameState,
} from "./game";
import { close_side, CLEAN, Fit, ideal_lift, judge, LIFT_RATE, open_side, reach, side_action, step_side, TRAVEL, use_side } from "./rack";
import { PALLET } from "./warehouse";
import { SolidKind } from "../../core/scene";

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

  test("fully in and square lifts; short of the face, or more than 10° off, doesn't", () => {
    expect(can_lift(fork_fit(at_pallet(pallet), pallet))).toBe(true);
    expect(fork_fit(at_pallet(pallet), pallet).gap).toBeCloseTo(0.05, 9);
    expect(can_lift(fork_fit(at_pallet(pallet, FULL_GAP + 0.05), pallet))).toBe(false);
    expect(can_lift(fork_fit(at_pallet(pallet, 0.05, 0, 9 * DEG), pallet))).toBe(true);
    expect(can_lift(fork_fit(at_pallet(pallet, 0.05, 0, 11 * DEG), pallet))).toBe(false);
  });

  test("the pockets forgive more than the fork spread: 15 cm either side of centre, 10° off square", () => {
    expect(FORK_ROOM).toBeCloseTo(0.07, 9);
    expect(JAM_SIDE).toBe(0.15);
    expect(in_pockets(fork_fit(at_pallet(pallet, 0.3, 0.14), pallet))).toBe(true);
    expect(in_pockets(fork_fit(at_pallet(pallet, 0.3, 0.16), pallet))).toBe(false);
    expect(in_pockets(fork_fit(at_pallet(pallet, 0.3, -0.16), pallet))).toBe(false);
    expect(in_pockets(fork_fit(at_pallet(pallet, 0.3, 0, 9.5 * DEG), pallet))).toBe(true);
    expect(in_pockets(fork_fit(at_pallet(pallet, 0.3, 0, 11 * DEG), pallet))).toBe(false);
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
  const start = create_game(level_round(3));
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
    expect(fork_hint(driving(start, at_pallet(task.from.home, 1.4, 0, 12.5 * DEG)))).toBe("Line up: 12.5° off");
    expect(fork_hint(driving(start, at_pallet(task.from.home, 1.4, 0.2)))).toBe("Line up: pallet 20 cm to the left");
    expect(fork_hint(driving(start, at_pallet(task.from.home, 1.4, -0.2)))).toBe("Line up: pallet 20 cm to the right");
    expect(fork_hint(driving(start, at_pallet(task.from.home, 1.4, 0.03)))).toBe("Drive the forks fully in");
  });

  const push = (state: GameState, steps: number, until: (next: GameState) => boolean = () => false): GameState => {
    let next = state;
    for (let i = 0; i < steps && !until(next); i++) next = advance(next, { steer: 0, throttle: 1, brake: 0 }, 1 / 60);
    return next;
  };

  test("forks off the pockets jam: a bump, the forklift stops where it was, pressing on is one bump", () => {
    const pallet = task.from.home;
    const crooked = driving(start, at_pallet(pallet, PALLET.length + 0.15, 0, 12 * DEG));
    const jammed = push(crooked, 600, (next) => next.bumps > 0);
    expect(jammed.status).toBe(Status.DRIVING);
    expect(jammed.car.speed).toBe(0);
    expect(jammed.car.gear).toBe(Gear.DRIVE);
    expect(bump_hint(jammed)).toBe("Jammed: back out");
    expect(bump_flash(jammed)).toBe(true);
    const held = push(jammed, 120);
    expect(held.bumps).toBe(1);
    expect(held.car.x).toBeCloseTo(jammed.car.x, 2);
    expect(held.car.y).toBeCloseTo(jammed.car.y, 2);
    expect(bump_flash(held)).toBe(false);
    let out = change_gear(held, Gear.REVERSE);
    out = push(out, 600, (next) => next.bumped === null);
    expect(out.status).toBe(Status.DRIVING);
    expect(Math.hypot(out.car.x - jammed.car.x, out.car.y - jammed.car.y)).toBeGreaterThan(BUMP_CLEAR);
    expect(bump_hint(out)).toBeNull();
    const again = push(change_gear(out, Gear.DRIVE), 600, (next) => next.bumps > 1);
    expect(again.bumps).toBe(2);
  });

  test("forks fully in, the mast meeting the pallet is an end stop, not a bump", () => {
    const stopped = push(driving(start, at_pallet(task.from.home, 0.4)), 600, (next) => next.car.speed === 0 && next.ms > 100);
    expect(stopped.bumps).toBe(0);
    expect(fork_action(stopped)).toBe(ForkAction.LIFT);
  });

  test("each bump adds 5 s to the time; the body against a rack is a bump too, and names it", () => {
    const pallet = task.from.home;
    const clean = advance(driving(start, at_pallet(pallet, 0.3)), { steer: 0, throttle: 0, brake: 0 }, 1 / 120);
    expect(clean.bumps).toBe(0);
    const before = driving(start, at_pallet(pallet, PALLET.length + 0.15, 0.2));
    const beside = push(before, 600, (next) => next.bumps > 0);
    expect(beside.bumps).toBe(1);
    const rammed = advance(driving(start, at_pallet(pallet, -0.1, 0.3)), { steer: 0, throttle: 0, brake: 0 }, 1 / 120);
    expect(rammed.status).toBe(Status.DRIVING);
    expect(rammed.ms).toBeCloseTo(1000 / 120 + BUMP_COST_MS, 6);
    expect(bump_hint(rammed)).toBe("Bumped a rack: back off");
  });

  test("moves count changes between D and R, the first gear not counted", () => {
    let state = set_status(start, Status.DRIVING);
    state = change_gear(state, Gear.REVERSE);
    state = change_gear(state, Gear.DRIVE);
    state = change_gear(state, Gear.REVERSE);
    expect(state.moves).toBe(2);
  });
});

describe("an upper tier", () => {
  const start = create_game(level_round(1));
  const task = start.floor.tasks[0];
  const at_face = driving(start, at_pallet(task.from.home, PALLET.length + 0.3));
  const opened = open_side(at_face);
  const view = opened.side!;
  const with_lift = (lift: number): GameState => ({ ...opened, side: { ...view, lift } });
  const drive_in = (state: GameState, steps = 600): GameState => {
    let next = state;
    for (let i = 0; i < steps && next.status === Status.DRIVING && !side_action(next); i++) next = step_side(next, { lift: 0, drive: 1 }, 1 / 120);
    return next;
  };

  test("the job's first pallet sits on ↑1 and the task line says so", () => {
    expect(task.from.tier).toBe(1);
    expect(task_line(start)).toBe(`Pallet 1/1 · pick up at ${task.from.name} ↑1`);
  });

  test("standing at the rack face, F opens the side view, the forks at travel height", () => {
    expect(fork_action(at_face)).toBe(ForkAction.RACK);
    expect(fork_hint(at_face)).toBeNull();
    expect(fork_hint(driving(start, at_pallet(task.from.home, 0.6)))).toBe("Back out to the rack face: it's up on ↑1");
    expect(view.kind).toBe(SideKind.PICK);
    expect(view.lift).toBe(TRAVEL);
  });

  test("raising runs at a fixed rate and holds once the tips are in", () => {
    const raised = step_side(opened, { lift: 1, drive: 0 }, 0.5);
    expect(raised.side!.lift).toBeCloseTo(TRAVEL + 0.5 * LIFT_RATE, 9);
    const inside = drive_in(with_lift(ideal_lift(view)), 180);
    expect(reach(inside, inside.side!)).toBeGreaterThan(0);
    expect(step_side(inside, { lift: 1, drive: 0 }, 0.5).side!.lift).toBe(inside.side!.lift);
  });

  test("clean or scraped goes in and lifts; the forks stay raised into the slot until they're out of it", () => {
    for (const off of [0.02, -0.07]) {
      const ready = drive_in(with_lift(ideal_lift(view) + off));
      expect(ready.status).toBe(Status.DRIVING);
      expect(judge(ready.side!.miss!)).toBe(Math.abs(off) <= CLEAN ? Fit.CLEAN : Fit.SCRAPE);
      expect(side_action(ready)).toBe(ForkAction.LIFT);
      const lifted = use_side(ready);
      expect(lifted.side).toBeNull();
      expect(lifted.raised).toBe(task.from);
      expect(lifted.loads[0].miss).toBeCloseTo(off, 9);
      const load = carried_pose(lifted);
      expect(settle_raised(lifted.raised, lifted.car, load)).toBe(task.from);
      const out = { ...lifted.car, ...at_pallet(task.from.home, 2.5) };
      expect(settle_raised(lifted.raised, out, load_pose(out, lifted.loads[0].carried!))).toBeNull();
    }
  });

  test("more than 10 cm off bumps the beam or the pallet: the forks stop short until the height is fixed", () => {
    const low = drive_in(with_lift(ideal_lift(view) - 0.12));
    expect(low.status).toBe(Status.DRIVING);
    expect(low.bumps).toBe(1);
    expect(reach(low, low.side!)).toBeLessThanOrEqual(0);
    expect(bump_hint(low)).toBe("The forks hit the beam: raise the forks");
    const high = drive_in(with_lift(ideal_lift(view) + 0.12));
    expect(high.bumps).toBe(1);
    expect(bump_hint(high)).toBe("Jammed: lower the forks");
    const lowered = step_side(high, { lift: -1, drive: 0 }, 0.1);
    expect(lowered.bumped).toBeNull();
    const ready = drive_in(lowered);
    expect(ready.bumps).toBe(1);
    expect(side_action(ready)).toBe(ForkAction.LIFT);
  });

  test("holding raise and in together raises the forks through the bump and goes in", () => {
    let state = opened;
    for (let i = 0; i < 1200 && !side_action(state); i++) state = step_side(state, { lift: 1, drive: 1 }, 1 / 120);
    expect(state.bumps).toBe(1);
    expect(state.bumped).toBeNull();
    expect(side_action(state)).toBe(ForkAction.LIFT);
  });

  test("a height bump goes with the view: backing out and pushing in low again is a new bump", () => {
    const low = drive_in(with_lift(ideal_lift(view) - 0.12));
    const closed = close_side(low);
    expect(closed.side).toBeNull();
    expect(closed.bumped).toBeNull();
    expect(bump_hint(closed)).toBeNull();
    const again = drive_in({ ...open_side(closed), side: { ...view, lift: ideal_lift(view) - 0.12 } });
    expect(again.bumps).toBe(2);
  });

  test("a bump close to where the view opened clears once the forklift is back there", () => {
    const touch = (into: number): GameState => {
      const car = { ...opened.car, ...along(view.from, into) };
      return { ...opened, car, bumped: { kind: SolidKind.RACK, by_load: false, from: { x: car.x, y: car.y }, miss: null } };
    };
    let state = touch(0.1);
    for (let i = 0; i < 120 && state.bumped; i++) state = step_side(state, { lift: 0, drive: -1 }, 1 / 120);
    expect(state.bumped).toBeNull();
    let stuck = touch(0);
    for (let i = 0; i < 60; i++) stuck = step_side(stuck, { lift: 0, drive: -1 }, 1 / 120);
    expect(stuck.bumped).not.toBeNull();
  });

  test("at the face, travel-height forks meeting the floor stock under the pallet stop without a bump", () => {
    const game = create_game(level_round(7));
    const i = game.floor.tasks.findIndex((each) => each.from.tier > 0 && game.floor.stock.some((slot) => slot.tier === 0 && slot.name === each.from.name));
    const upper = game.floor.tasks[i];
    let state: GameState = { ...driving(game, at_pallet(upper.from.home, PALLET.length + 0.3)), current: i };
    for (let step = 0; step < 600; step++) {
      const next = advance(state, { steer: 0, throttle: 0.3, brake: 0 }, 1 / 60);
      const stopped = next.car.speed === 0 && state.car.speed > 0;
      state = next;
      if (stopped) break;
    }
    expect(fork_fit(state.car, upper.from.home).gap).toBeLessThan(PALLET.length + 0.05);
    expect(state.bumps).toBe(0);
    expect(fork_action(state)).toBe(ForkAction.RACK);
  });

  test("back out of the view only with the forks out", () => {
    expect(close_side(opened).side).toBeNull();
    const inside = drive_in(with_lift(ideal_lift(view)), 180);
    expect(close_side(inside)).toBe(inside);
  });

  test("a height miss costs precision as a share of 10 cm", () => {
    const home = task.from.home;
    expect(drop_fit(home, task.from, [0.05]).score).toBeCloseTo(drop_fit(home, task.from).score * 0.75, 6);
    expect(drop_fit(home, task.from, [0.02, -0.07]).miss).toBeCloseTo(0.07, 9);
    expect(drop_fit(home, task.from, [0.12]).score).toBe(0);
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
    expect(stars({ ...done, status: Status.DRIVING, moves: 0 }, 60_000)).toBe(0);
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
