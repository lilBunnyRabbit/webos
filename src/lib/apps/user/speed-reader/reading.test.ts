import { describe, expect, test } from "vitest";
import { EMPTY_TALLY, FAST_WPM, read_through, reported, tally } from "./reading";

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
    expect(state).toMatchObject({ words: 30, fast: 4, fast_best: 25 });
  });
});

describe("read_through", () => {
  test("needs every word from the first in one stretch", () => {
    const state = tally(tally(EMPTY_TALLY, 0, 6, 300), 6, 10, 300);
    expect(read_through(state, 10)).toBe(true);
    expect(read_through(tally(EMPTY_TALLY, 0, 9, 300), 10)).toBe(false);
    expect(read_through(EMPTY_TALLY, 0)).toBe(false);
  });

  test("a seek to the end and playing out the last words is not a read-through", () => {
    expect(read_through(tally(EMPTY_TALLY, 9, 10, 300), 10)).toBe(false);
  });

  test("a jump forward mid-play starts a new stretch", () => {
    const state = tally(tally(EMPTY_TALLY, 0, 3, 300), 7, 10, 300);
    expect(read_through(state, 10)).toBe(false);
  });

  test("a pause midway keeps the stretch, a seek back to the start makes a new one", () => {
    const paused = reported(tally(EMPTY_TALLY, 0, 5, 300));
    expect(paused.words).toBe(0);
    expect(read_through(tally(paused, 5, 10, 300), 10)).toBe(true);
    const elsewhere = reported(tally(EMPTY_TALLY, 4, 8, 300));
    expect(read_through(tally(elsewhere, 0, 10, 300), 10)).toBe(true);
  });
});
