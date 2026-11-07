import { describe, expect, test } from "vitest";
import { add_progress, better, keep_best, keep_precision, open_through, track_progress, unlocked, with_stars } from "./track";

interface Run {
  stars: number;
  ms: number;
  precision?: number;
}

describe("track", () => {
  test("the level after the highest finished opens, never past the last", () => {
    expect(unlocked({}, 12)).toBe(1);
    expect(unlocked({ 1: 3, 2: 1 }, 12)).toBe(3);
    expect(unlocked({ x: 3, 5: 1 }, 12)).toBe(6);
    expect(unlocked({ 12: 2 }, 12)).toBe(12);
    expect(open_through([], 4)).toBe(1);
  });

  test("a level keeps its most stars", () => {
    expect(with_stars(with_stars({}, 2, 3), 2, 1)).toEqual({ 2: 3 });
  });

  test("best: more stars, then quicker; unimproved leaves the bests as they were", () => {
    expect(better({ stars: 2, ms: 10 }, { stars: 3, ms: 99 })).toBe(true);
    expect(better({ stars: 2, ms: 10 }, { stars: 2, ms: 11 })).toBe(false);
    const bests = { a: { stars: 3, ms: 10 } };
    const kept = keep_best(bests, "a", { stars: 2, ms: 5 }, better);
    expect(kept).toEqual({ bests, improved: false, first: false });
    expect(kept.bests).toBe(bests);
  });

  test("precision only rises, whichever run set it", () => {
    const first = keep_best<Run>({}, "a", { stars: 2, ms: 50, precision: 90 }, better, keep_precision);
    const slower = keep_best(first.bests, "a", { stars: 2, ms: 60, precision: 97 }, better, keep_precision);
    expect(slower.bests.a).toEqual({ stars: 2, ms: 50, precision: 97 });
    expect(keep_best<Run>({}, "a", { stars: 1, ms: 5 }, better, keep_precision).bests.a).toEqual({ stars: 1, ms: 5 });
  });

  test("progress counts the track's levels, three stars each", () => {
    expect(track_progress({ 1: 3, 2: 1, 13: 3, x: 2 }, 12)).toEqual({ stars: 4, total: 36 });
    expect(add_progress({ stars: 4, total: 36 }, { stars: 2, total: 6 })).toEqual({ stars: 6, total: 42 });
  });
});
