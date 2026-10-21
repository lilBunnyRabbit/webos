import { describe, expect, test } from "vitest";
import { moved_mark, remove_span, source_time } from "./timeline";

const whole = [{ start: 0, end: 10 }];

describe("remove_span", () => {
  test("splits the segment around a middle cut", () => {
    expect(remove_span(whole, { start: 2, end: 4 }, 0)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 10 },
    ]);
  });

  test("a second cut lands in source time past the first", () => {
    const once = remove_span(whole, { start: 2, end: 4 }, 0);
    expect(remove_span(once, { start: 3, end: 5 }, 0)).toEqual([
      { start: 0, end: 2 },
      { start: 4, end: 5 },
      { start: 7, end: 10 },
    ]);
  });

  test("a cut across a seam trims both sides", () => {
    const once = remove_span(whole, { start: 2, end: 4 }, 0);
    expect(remove_span(once, { start: 1, end: 3 }, 0)).toEqual([
      { start: 0, end: 1 },
      { start: 5, end: 10 },
    ]);
  });

  test("cutting the head leaves the tail", () => {
    expect(remove_span(whole, { start: 0, end: 3 }, 0)).toEqual([{ start: 3, end: 10 }]);
  });
});

describe("source_time", () => {
  test("maps straight through without cuts", () => expect(source_time(whole, 3.5, 0.01)).toBe(3.5));

  test("skips the removed span", () => {
    const segments = remove_span(whole, { start: 2, end: 4 }, 0);
    expect(source_time(segments, 1, 0)).toBe(1);
    expect(source_time(segments, 2.5, 0)).toBe(4.5);
  });

  test("accounts for the crossfade overlap at a seam", () => {
    const segments = [
      { start: 0, end: 2 },
      { start: 4, end: 10 },
    ];
    expect(source_time(segments, 3, 0.5)).toBeCloseTo(5.5, 5);
  });

  test("clamps past the end", () => expect(source_time(whole, 12, 0)).toBe(10));
});

describe("moved_mark", () => {
  const marks = { start: 0, end: 10, selection: null };

  test("follows the start handle", () => expect(moved_mark(marks, { ...marks, start: 2 })).toBe(2));
  test("follows the end handle", () => expect(moved_mark(marks, { ...marks, end: 8 })).toBe(8));
  test("nothing moved", () => expect(moved_mark(marks, { ...marks })).toBeNull());

  test("follows the selection edge being dragged", () => {
    const left = { ...marks, selection: { start: 3, end: 5 } };
    expect(moved_mark(marks, left)).toBe(3);
    expect(moved_mark(left, { ...marks, selection: { start: 3, end: 6 } })).toBe(6);
    expect(moved_mark(left, { ...marks, selection: { start: 2, end: 5 } })).toBe(2);
  });
});
