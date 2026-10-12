import { describe, expect, test } from "vitest";
import {
  DEFAULT_PAUSES,
  NO_PAUSES,
  build_timeline,
  elapsed_at,
  elapsed_for_index,
  format_duration,
  index_for_elapsed,
  position_at,
  word_ms,
} from "./timeline";
import { tokenize } from "./tokens";

const holds = (text: string, wpm = 300) =>
  build_timeline(tokenize(text), wpm, DEFAULT_PAUSES).segments.map((segment) => segment.hold_ms);

describe("build_timeline", () => {
  test("every word gets 60000 / wpm", () => {
    expect(word_ms(300)).toBe(200);
    expect(holds("one two three")).toEqual([200, 200, 200]);
  });

  test("long words get no extra time", () => {
    expect(holds("internationalization a")).toEqual([200, 200]);
  });

  test("punctuation adds an absolute pause per kind", () => {
    expect(holds("First. Second. well, wait… ago— end")).toEqual([900, 900, 450, 1100, 350, 200]);
  });

  test("pauses don't scale with speed", () => {
    const [slow] = build_timeline(tokenize("Go. Run. c"), 150, DEFAULT_PAUSES).segments;
    const [fast] = build_timeline(tokenize("Go. Run. c"), 600, DEFAULT_PAUSES).segments;
    expect(slow.pause_ms).toBe(700);
    expect(fast.pause_ms).toBe(700);
    expect(slow.hold_ms - fast.hold_ms).toBe(word_ms(150) - word_ms(600));
  });

  test("a single sentence gets no sentence pause, but keeps its commas", () => {
    expect(holds("Well, here it is. and more")).toEqual([450, 200, 200, 200, 200, 200]);
  });

  test("abbreviations and initials aren't sentence ends", () => {
    expect(holds("Mr. Smith met J. R. R. Tolkien. Then left.")).toEqual([200, 200, 200, 200, 200, 200, 900, 200, 200]);
  });

  test("the last word gets no pause", () => {
    expect(holds("One. Two.")).toEqual([900, 200]);
  });

  test("no pauses means base time only", () => {
    const timeline = build_timeline(tokenize("One. Two, three."), 300, NO_PAUSES);
    expect(timeline.segments.map((segment) => segment.hold_ms)).toEqual([200, 200, 200]);
  });

  test("segments are contiguous and add up to the total", () => {
    const timeline = build_timeline(tokenize("One, two. Three… four— five."), 240, DEFAULT_PAUSES);
    timeline.segments.forEach((segment, index) => {
      expect(segment.hold_ms).toBe(segment.base_ms + segment.pause_ms);
      const next = timeline.segments[index + 1];
      expect(next?.start_ms ?? timeline.total_ms).toBeCloseTo(segment.start_ms + segment.hold_ms);
    });
  });

  test("empty text is an empty timeline", () => {
    expect(build_timeline([], 300, DEFAULT_PAUSES)).toEqual({ segments: [], total_ms: 0 });
  });
});

describe("seeking", () => {
  const timeline = build_timeline(tokenize("One, two three."), 300, DEFAULT_PAUSES);

  test.each([
    [-5, 0],
    [0, 0],
    [449, 0],
    [450, 1],
    [649, 1],
    [650, 2],
    [10_000, 2],
  ])("%i ms → word %i", (elapsed, index) => {
    expect(index_for_elapsed(timeline, elapsed)).toBe(index);
  });

  test("seeks to a word's start, clamped", () => {
    expect(elapsed_for_index(timeline, 1)).toBe(450);
    expect(elapsed_for_index(timeline, 99)).toBe(650);
    expect(elapsed_for_index(timeline, -1)).toBe(0);
    expect(elapsed_for_index(build_timeline([], 300, NO_PAUSES), 3)).toBe(0);
  });

  test("round-trips every word", () => {
    timeline.segments.forEach((_, index) => {
      expect(index_for_elapsed(timeline, elapsed_for_index(timeline, index))).toBe(index);
    });
  });
});

describe("position", () => {
  const tokens = tokenize("One, two three.");

  test("is a word plus how far through its hold", () => {
    const timeline = build_timeline(tokens, 300, DEFAULT_PAUSES);
    expect(position_at(timeline, 225)).toEqual({ index: 0, progress: 0.5 });
    expect(elapsed_at(timeline, { index: 0, progress: 0.5 })).toBe(225);
  });

  test("survives a rebuild at another speed, proportionally", () => {
    const before = build_timeline(tokens, 300, DEFAULT_PAUSES);
    const after = build_timeline(tokens, 600, DEFAULT_PAUSES);
    const position = position_at(before, 550);
    expect(position).toEqual({ index: 1, progress: 0.5 });
    expect(elapsed_at(after, position)).toBe(after.segments[1].start_ms + after.segments[1].hold_ms / 2);
  });

  test("clamps outside the timeline", () => {
    const timeline = build_timeline(tokens, 300, DEFAULT_PAUSES);
    expect(position_at(timeline, timeline.total_ms + 50)).toEqual({ index: 2, progress: 1 });
    expect(position_at(build_timeline([], 300, NO_PAUSES), 10)).toEqual({ index: 0, progress: 0 });
    expect(elapsed_at(build_timeline([], 300, NO_PAUSES), { index: 4, progress: 1 })).toBe(0);
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
