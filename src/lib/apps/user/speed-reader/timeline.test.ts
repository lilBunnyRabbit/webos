import { describe, expect, test } from "vitest";
import { build_timeline, elapsed_for_index, format_duration, hold_ms, index_for_elapsed, word_ms } from "./timeline";
import { tokenize } from "./tokens";

const token = (text: string) => tokenize(text)[0];

describe("hold_ms", () => {
  test("a plain short word gets the base time", () => {
    expect(word_ms(300)).toBe(200);
    expect(hold_ms(token("word"), 300, 400)).toBe(200);
  });

  test("punctuation adds an absolute pause, scaled by kind", () => {
    expect(hold_ms(token("end."), 300, 400)).toBe(600);
    expect(hold_ms(token("wait…"), 300, 400)).toBe(600);
    expect(hold_ms(token("ago—"), 300, 400)).toBe(400);
    expect(hold_ms(token("well,"), 300, 400)).toBe(360);
  });

  test("the pause doesn't depend on speed", () => {
    expect(hold_ms(token("end."), 600, 400) - word_ms(600)).toBe(400);
  });

  test("a paragraph end pauses longer than a sentence", () => {
    const [first] = tokenize("end.\n\nNext");
    expect(hold_ms(first, 300, 400)).toBe(800);
  });

  test("long words stay up longer, capped at double", () => {
    expect(hold_ms(token("recognize"), 300, 0)).toBe(225);
    expect(hold_ms(token("internationalization"), 300, 0)).toBe(400);
  });

  test("no pause setting means no punctuation pause", () => {
    expect(hold_ms(token("end."), 300, 0)).toBe(200);
  });

  test("the last token gets no pause", () => {
    expect(hold_ms(token("end."), 300, 400, true)).toBe(200);
  });
});

describe("build_timeline", () => {
  const timeline = build_timeline(tokenize("One, two three."), 300, 400);

  test("starts are cumulative holds", () => {
    expect(timeline.starts).toEqual([0, 360, 560]);
    expect(timeline.total_ms).toBe(760);
  });

  test("empty text is an empty timeline", () => {
    expect(build_timeline([], 300, 400)).toEqual({ starts: [], total_ms: 0 });
  });
});

describe("index_for_elapsed / elapsed_for_index", () => {
  const timeline = build_timeline(tokenize("One, two three."), 300, 400);

  test.each([
    [-5, 0],
    [0, 0],
    [359, 0],
    [360, 1],
    [559, 1],
    [560, 2],
    [10_000, 2],
  ])("%i ms → word %i", (elapsed, index) => {
    expect(index_for_elapsed(timeline, elapsed)).toBe(index);
  });

  test("seeks to a word's start, clamped", () => {
    expect(elapsed_for_index(timeline, 1)).toBe(360);
    expect(elapsed_for_index(timeline, 99)).toBe(560);
    expect(elapsed_for_index(timeline, -1)).toBe(0);
    expect(elapsed_for_index(build_timeline([], 300, 0), 3)).toBe(0);
  });

  test("round-trips every word", () => {
    timeline.starts.forEach((_, index) => {
      expect(index_for_elapsed(timeline, elapsed_for_index(timeline, index))).toBe(index);
    });
  });
});

describe("format_duration", () => {
  test.each([
    [0, "0:00"],
    [42_000, "0:42"],
    [725_000, "12:05"],
    [3_723_000, "1:02:03"],
    [-1000, "0:00"],
  ])("%i → %s", (ms, expected) => {
    expect(format_duration(ms)).toBe(expected);
  });
});
