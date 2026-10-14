import { describe, expect, it } from "vitest";
import { daily_seed, day_key, format_time, parse_day } from "./time";

describe("format_time", () => {
  it("formats minutes and seconds", () => {
    expect(format_time(0)).toBe("0:00");
    expect(format_time(65_400)).toBe("1:05");
  });
  it("adds hours past an hour", () => {
    expect(format_time(3_725_000)).toBe("1:02:05");
  });
  it("adds tenths on request", () => {
    expect(format_time(65_400, { tenths: true })).toBe("1:05.4");
  });
  it("clamps negatives", () => {
    expect(format_time(-5)).toBe("0:00");
  });
});

describe("daily seeds", () => {
  it("keys the local day", () => {
    expect(day_key(new Date(2026, 9, 4))).toBe("2026-10-04");
  });
  it("is stable per day and game, different across them", () => {
    expect(daily_seed("2026-10-14", "sudoku")).toBe(daily_seed("2026-10-14", "sudoku"));
    expect(daily_seed("2026-10-14", "sudoku")).not.toBe(daily_seed("2026-10-15", "sudoku"));
    expect(daily_seed("2026-10-14", "sudoku")).not.toBe(daily_seed("2026-10-14", "kakuro"));
  });
});

describe("parse_day", () => {
  const now = new Date(2026, 2, 1, 15, 30);
  it("reads words and days back", () => {
    expect(parse_day("today", now)).toEqual({ ok: true, day: "2026-03-01" });
    expect(parse_day("Yesterday", now)).toEqual({ ok: true, day: "2026-02-28" });
    expect(parse_day("-7", now)).toEqual({ ok: true, day: "2026-02-22" });
  });
  it("accepts real calendar days up to today", () => {
    expect(parse_day("2026-02-28", now)).toEqual({ ok: true, day: "2026-02-28" });
    expect(parse_day("2026-03-01", now)).toEqual({ ok: true, day: "2026-03-01" });
  });
  it("rejects malformed and impossible days", () => {
    expect(parse_day("2026-02-30", now).ok).toBe(false);
    expect(parse_day("2026-2-3", now).ok).toBe(false);
    expect(parse_day("soon", now).ok).toBe(false);
  });
  it("rejects the future", () => {
    expect(parse_day("2026-03-02", now)).toEqual({ ok: false, error: "no daily puzzle for 2026-03-02 yet" });
  });
});
