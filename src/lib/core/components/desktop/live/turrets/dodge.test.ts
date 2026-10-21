import { describe, expect, test } from "vitest";
import { MAX_STEP_MS, advance, format_dodge, parse_record, serialize_record } from "./dodge";

describe("advance", () => {
  test("counts time while running", () => {
    expect(advance(1000, { dt_ms: 16, running: true, hits: 0 })).toBe(1016);
  });

  test("holds while paused or the cursor is away", () => {
    expect(advance(1000, { dt_ms: 16, running: false, hits: 0 })).toBe(1000);
  });

  test("a hit resets to zero, running or not", () => {
    expect(advance(5000, { dt_ms: 16, running: true, hits: 1 })).toBe(0);
    expect(advance(5000, { dt_ms: 16, running: false, hits: 2 })).toBe(0);
  });

  test("caps a stalled frame and ignores a negative step", () => {
    expect(advance(0, { dt_ms: 5000, running: true, hits: 0 })).toBe(MAX_STEP_MS);
    expect(advance(10, { dt_ms: -50, running: true, hits: 0 })).toBe(10);
  });
});

describe("record", () => {
  test("round-trips, rounded to the millisecond", () => {
    const text = serialize_record({ best_ms: 12345.6, at: 1700000000000 });
    expect(parse_record(text)).toEqual({ best_ms: 12346, at: 1700000000000 });
    expect(JSON.parse(text).version).toBe(1);
  });

  test("missing, corrupt or another version is no record", () => {
    expect(parse_record(null)).toBeNull();
    expect(parse_record("{")).toBeNull();
    expect(parse_record(JSON.stringify({ version: 2, best_ms: 10, at: 0 }))).toBeNull();
    expect(parse_record(JSON.stringify({ version: 1, best_ms: -1, at: 0 }))).toBeNull();
  });
});

describe("format", () => {
  test("tenths under a minute, rounded down", () => {
    expect(format_dodge(0)).toBe("0.0");
    expect(format_dodge(12399)).toBe("12.3");
  });

  test("minutes and hours", () => {
    expect(format_dodge(62_300)).toBe("1:02.3");
    expect(format_dodge(3_723_400)).toBe("1:02:03.4");
  });
});
