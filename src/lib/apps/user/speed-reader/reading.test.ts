import { describe, expect, test } from "vitest";
import { EMPTY_TALLY, FAST_WPM, tally } from "./reading";

describe("tally", () => {
  test("counts the words that passed", () => {
    expect(tally(tally(EMPTY_TALLY, 0, 3, 300), 3, 5, 300).words).toBe(5);
  });

  test("ignores a jump back or a frame on the same word", () => {
    const state = tally(EMPTY_TALLY, 0, 4, 300);
    expect(tally(state, 4, 4, 300)).toBe(state);
    expect(tally(state, 4, 1, 300)).toBe(state);
  });

  test("a fast run grows at speed and starts over below it, keeping the best", () => {
    let state = tally(EMPTY_TALLY, 0, 10, FAST_WPM);
    state = tally(state, 10, 25, FAST_WPM + 100);
    expect(state.fast).toBe(25);
    state = tally(state, 25, 26, FAST_WPM - 50);
    expect(state.fast).toBe(0);
    state = tally(state, 26, 30, FAST_WPM);
    expect(state).toEqual({ words: 30, fast: 4, fast_best: 25 });
  });
});
