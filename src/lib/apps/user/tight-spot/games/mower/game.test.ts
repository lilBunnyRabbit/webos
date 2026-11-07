import { describe, expect, test } from "vitest";
import { daily_seed } from "$kit/games";
import { rect } from "$kit/games/play2d/geometry";
import { collide, obstacles } from "../../core/obstacles";
import { Gear } from "../../core/vehicle";
import { Cut, Ground } from "./coverage";
import {
  advance,
  BUMP_COST_MS,
  bump_hint,
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
  measure_fallback,
  out_of_reach,
  record,
  rig_of,
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
  }, 90_000);

  test("the first twelve levels are the gardens they always were; the ones after bring one thing each, then mix", () => {
    for (let level = 1; level <= 12; level++) {
      const round = level_round(level);
      expect(round.twist).toBeUndefined();
      expect(round.difficulty).toBeCloseTo((level - 1) / 11);
    }
    const twists = Array.from({ length: LEVEL_COUNT - 12 }, (_, i) => level_round(13 + i).twist);
    expect(twists.slice(0, 2)).toEqual([{ pattern: "east-west" }, { bank: "straight" }]);
    for (let level = 13; level <= LEVEL_COUNT; level++) {
      const state = create_game(level_round(level));
      if (state.round.twist?.bank) expect(state.garden.banks, `level ${level}`).toHaveLength(1);
      expect(collide(state.car, obstacles(state.garden), rig_of(state.round).spec), `level ${level}`).toBeNull();
    }
  });

  test("a bank holds a step that turns across it, like a bump, and lets the mower straighten up", () => {
    const base = driving(create_game(level_round(1)));
    const garden = { ...base.garden, banks: [{ shape: rect(0, 0, 40, 40), fall: Math.PI / 2 }] };
    const across = { ...base, garden, car: { ...base.car, x: 3, y: 3, heading: 0.3 + Math.PI / 2 } };
    expect(collide(across.car, obstacles(garden), rig_of(base.round).spec)).toBeNull();
    const held = run(across, 1.5, { steer: 1, throttle: 1, brake: 0 });
    expect(held.bumps).toBe(1);
    expect(bump_hint(held)).toMatch(/across the bank/);
    const back = run(held, 1, { steer: -1, throttle: 1, brake: 0 });
    expect(Math.abs(back.car.heading - Math.PI / 2)).toBeLessThan(Math.abs(held.car.heading - Math.PI / 2));
  });

  test("the tractor cuts with the gang mower behind it", () => {
    const state = run(driving(measure(create_game(level_round(17)))), 4.5);
    expect(state.bumps).toBe(0);
    expect(state.tally.mown).toBeGreaterThan(100);
    const { grid } = state;
    const ahead = Math.floor(state.car.y / 0.15) * grid.cols + Math.floor(state.car.x / 0.15);
    expect(grid.cut[ahead]).toBe(Cut.LONG);
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

  test("a solid is a bump: the mower stops, pressing on counts once, backing off clears it", () => {
    const state = run(driving(measure(create_game(level_round(1)))), 12);
    expect(state.status).toBe(Status.DRIVING);
    expect(state.bumps).toBe(1);
    expect(state.ms).toBeGreaterThan(12_000 + BUMP_COST_MS - 50);
    expect(state.contact).not.toBeNull();
    expect(bump_hint(state)).toBe("Bumped the hedge: back off");
    const backed = run(change_gear(state, Gear.REVERSE), 1);
    expect(backed.bumped).toBeNull();
    expect(run(change_gear(backed, Gear.DRIVE), 3).bumps).toBe(2);
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

  test("the round is lost once the flowers put the finish line out of reach", () => {
    const tally = { coverable: 1000, mown: 0, overlapped: 0, trampled: 33 };
    expect(out_of_reach(tally)).toBe(false);
    expect(out_of_reach({ ...tally, trampled: 34 })).toBe(true);
    expect(out_of_reach({ ...tally, coverable: 0, trampled: 50 })).toBe(false);
  });

  test("without the worker the whole lawn counts", () => {
    const round = level_round(3);
    const fallback = measure_fallback(round);
    const state = create_game(round);
    const lawn = state.grid.ground.filter((ground) => ground === Ground.LAWN).length;
    expect(fallback.count).toBe(lawn);
    expect(fallback.par_ms).toBeGreaterThan(0);
  });
});
