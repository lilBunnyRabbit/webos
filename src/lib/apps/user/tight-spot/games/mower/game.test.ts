import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games";
import { Gear } from "../../core/vehicle";
import { Cut, Ground } from "./coverage";
import {
  advance,
  can_finish,
  change_gear,
  coverage,
  create_game,
  daily_round,
  EMPTY,
  finish,
  lawn_round,
  LEVEL_COUNT,
  level_round,
  measure,
  record,
  set_status,
  stars,
  Status,
  unlocked,
  type GameState,
} from "./game";

const DT = 1 / 120;
const GAS = { steer: 0, throttle: 1, brake: 0 };

function driving(state: GameState): GameState {
  return change_gear(set_status(state, Status.DRIVING), Gear.DRIVE);
}

function run(state: GameState, seconds: number, input = GAS): GameState {
  let next = state;
  for (let t = 0; t < seconds && next.status === Status.DRIVING; t += DT) next = advance(next, input, DT);
  return next;
}

describe("mow day", () => {
  test("every level's lawn is mostly coverable from the shed", () => {
    for (let level = 1; level <= LEVEL_COUNT; level++) {
      const state = measure(create_game(level_round(level)));
      let lawn = 0;
      for (const ground of state.grid.ground) if (ground === Ground.LAWN) lawn++;
      expect(state.tally.coverable / lawn, `level ${level}`).toBeGreaterThan(0.85);
    }
  });

  test("the daily is the same lawn for everyone", () => {
    const day = "2026-10-29";
    const a = create_game(daily_round(day, daily_seed(day, "tight-spot/mower")));
    const b = create_game(daily_round(day, daily_seed(day, "tight-spot/mower")));
    expect(a.garden).toEqual(b.garden);
    expect(a.round.difficulty).toBeGreaterThanOrEqual(0.3);
  });

  test("driving off the patio mows a dark stripe northward and counts it", () => {
    const state = run(driving(measure(create_game(level_round(1)))), 2);
    expect(state.status).toBe(Status.DRIVING);
    expect(state.tally.mown).toBeGreaterThan(50);
    const { grid } = state;
    const cut = Array.from(grid.cut).filter((c) => c !== Cut.LONG);
    expect(cut.every((c) => c === Cut.DARK)).toBe(true);
    expect(state.tally.overlapped).toBe(0);
  });

  test("a solid ends the round", () => {
    const state = run(driving(measure(create_game(level_round(1)))), 30);
    expect(state.status).toBe(Status.CRASHED);
    expect(state.hit).not.toBeNull();
    expect(state.contact).not.toBeNull();
  });

  test("finishing takes 90% of the coverable lawn, then stars come from overlap and par", () => {
    const state = driving(measure(create_game(lawn_round(9))));
    expect(can_finish(state)).toBe(false);
    expect(finish(state)).toBe(state);
    const mown = { ...state, tally: { ...state.tally, mown: Math.ceil(state.tally.coverable * 0.9) } };
    expect(coverage(mown.tally)).toBeGreaterThanOrEqual(0.9);
    const done = finish(mown);
    expect(done.status).toBe(Status.DONE);
    expect(stars(done, null)).toBe(2);
    expect(stars({ ...done, ms: 10_000 }, 20_000)).toBe(3);
    expect(stars({ ...done, tally: { ...done.tally, overlapped: done.tally.coverable } }, null)).toBe(1);
  });

  test("bests keep more stars, then time; levels unlock in turn", () => {
    const round = level_round(3);
    const first = record(EMPTY, round, { stars: 2, ms: 90_000, coverage: 93, overlap: 20 });
    expect(first.first).toBe(true);
    const slower = record(first.saved, round, { stars: 2, ms: 99_000, coverage: 97, overlap: 15 });
    expect(slower.improved).toBe(false);
    expect(slower.saved.best["level:3"]).toEqual({ stars: 2, ms: 90_000, coverage: 97, overlap: 15 });
    const better = record(slower.saved, round, { stars: 3, ms: 120_000, coverage: 91, overlap: 10 });
    expect(better.improved).toBe(true);
    expect(better.saved.levels[3]).toBe(3);
    expect(unlocked(better.saved.levels)).toBe(4);
    expect(unlocked({})).toBe(1);
  });
});
