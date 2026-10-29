import { describe, expect, test } from "vitest";
import { overlaps } from "../../core/collision";
import { obstacles } from "../../core/obstacles";
import { create_car, folds, Gear, NO_INPUT, type Car } from "../../core/vehicle";
import { aircraft_parts, nose_gear, pose_from_nose_gear } from "./aircraft";
import { build_apron, Face, TOWBAR } from "./apron";
import {
  advance,
  aircraft_pose,
  change_gear,
  contact,
  create_game,
  crash_title,
  EMPTY_SAVE,
  is_done,
  judge,
  level_round,
  record,
  set_status,
  SPEC,
  stars,
  Status,
  STEERING,
  stop_hint,
  type GameState,
} from "./game";

function at_mark(state: GameState, along = 0, across = 0, turn = 0): Car {
  const { apron } = state;
  const back = apron.heading + Math.PI;
  const gear = {
    x: apron.stop.x + Math.cos(back) * along - Math.sin(back) * across,
    y: apron.stop.y + Math.sin(back) * along + Math.cos(back) * across,
  };
  const heading = apron.heading + turn;
  const tug = heading + Math.PI;
  return create_car({ x: gear.x - Math.cos(tug) * TOWBAR, y: gear.y - Math.sin(tug) * TOWBAR, heading: tug }, Gear.DRIVE, SPEC);
}

describe("apron", () => {
  test("the same seed builds the same apron, and both ways turn up", () => {
    expect(JSON.stringify(build_apron(42, 0.5).solids)).toBe(JSON.stringify(build_apron(42, 0.5).solids));
    const faces = new Set(Array.from({ length: 12 }, (_, i) => build_apron(i * 31, 0.5).face));
    expect(faces).toEqual(new Set([Face.WEST, Face.EAST]));
  });

  test("the rig starts clear, the aircraft hanging ahead of the tug with its nose gear on the stand", () => {
    for (const seed of [1, 2, 3]) {
      const state = create_game(level_round(seed * 4));
      expect(contact(obstacles(state.apron), state.apron, state.car, 0.3)).toBeNull();
      const gear = nose_gear(aircraft_pose(state.car));
      const stand = state.apron.stands.find((each) => each.mine)!;
      expect(Math.hypot(gear.x - stand.at.x, gear.y - stand.at.y)).toBeLessThan(1e-9);
      expect(folds(state.car, SPEC)[0]).toBeCloseTo(0, 9);
    }
  });

  test("the aircraft's place at the mark touches nothing", () => {
    for (const level of [1, 12]) {
      const { apron } = create_game(level_round(level));
      const goal = aircraft_parts(pose_from_nose_gear(apron.stop, apron.heading));
      for (const part of goal) for (const solid of apron.solids) expect(overlaps(part, solid.shape)).toBe(false);
    }
  });
});

describe("judging", () => {
  const ready = () => set_status(create_game(level_round(3)), Status.DRIVING);

  test("on the mark, on the line and straight is done", () => {
    const state = ready();
    expect(is_done(judge(state.apron, at_mark(state)))).toBe(true);
    expect(is_done(judge(state.apron, at_mark(state, 0.9, 0.2, 0.02)))).toBe(true);
  });

  test("short, past, off the line or turned is not", () => {
    const state = ready();
    expect(is_done(judge(state.apron, at_mark(state, -1.2)))).toBe(false);
    expect(is_done(judge(state.apron, at_mark(state, 1.2)))).toBe(false);
    expect(is_done(judge(state.apron, at_mark(state, 0, 0.6)))).toBe(false);
    expect(is_done(judge(state.apron, at_mark(state, 0, 0, 0.1)))).toBe(false);
  });

  test("P on the mark ends the push; elsewhere it says why", () => {
    const state = { ...ready(), last_drive: Gear.DRIVE };
    const done = change_gear({ ...state, car: { ...at_mark(state), speed: 0 } }, Gear.PARK);
    expect(done.status).toBe(Status.DONE);
    const short = change_gear({ ...state, car: { ...at_mark(state, -3), speed: 0 } }, Gear.PARK);
    expect(short.status).toBe(Status.DRIVING);
    expect(stop_hint(short)).toBe("Nose gear 3.0 m short of the stop mark");
  });

  test("the nose gear past its lock ends the push", () => {
    const state = ready();
    const car = state.car;
    const folded = { ...car, trailers: [{ ...car.trailers![0], heading: car.trailers![0].heading + 1.4 }] };
    const next = advance({ ...state, car: folded }, NO_INPUT, 1 / 120);
    expect(next.status).toBe(Status.CRASHED);
    expect(next.hit?.kind).toBe(STEERING);
    expect(crash_title(next.hit)).toBe("Nose gear past its steering lock");
  });

  test("stars: done, no change of direction, par time", () => {
    const done = { status: Status.DONE, moves: 0, ms: 60_000 };
    expect(stars(done, 70_000)).toBe(3);
    expect(stars({ ...done, moves: 1 }, 70_000)).toBe(2);
    expect(stars(done, 50_000)).toBe(2);
    expect(stars(done, null)).toBe(2);
    expect(stars({ ...done, status: Status.CRASHED }, 70_000)).toBe(0);
  });

  test("bests keep more stars, then quicker; levels keep their most stars", () => {
    const round = level_round(2);
    let save = record(EMPTY_SAVE, round, { stars: 2, ms: 50_000 }).save;
    save = record(save, round, { stars: 1, ms: 30_000 }).save;
    expect(save.best["level:2"]).toEqual({ stars: 2, ms: 50_000 });
    expect(save.levels[2]).toBe(2);
    save = record(save, round, { stars: 2, ms: 40_000 }).save;
    expect(save.best["level:2"].ms).toBe(40_000);
  });
});
