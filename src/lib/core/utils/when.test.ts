import { describe, expect, it } from "vitest";
import { parse_alarm_time, parse_duration, parse_when, when_examples } from "./when";

describe("parse_duration", () => {
  it("reads durations", () => {
    expect(parse_duration("5m")).toBe(5 * 60_000);
    expect(parse_duration("1h30m")).toBe(90 * 60_000);
    expect(parse_duration("1h30m15s")).toBe(90 * 60_000 + 15_000);
    expect(parse_duration("90s")).toBe(90_000);
    expect(parse_duration("10")).toBe(10 * 60_000);
    expect(parse_duration("2H")).toBe(2 * 3_600_000);
    for (const bad of ["", "0", "0m", "5x", "m", "30m1h", "1.5h"]) expect(parse_duration(bad)).toBeNull();
  });
});

describe("parse_alarm_time", () => {
  it("reads alarm times", () => {
    expect(parse_alarm_time("7:30")).toBe("07:30");
    expect(parse_alarm_time("23:59")).toBe("23:59");
    for (const bad of ["24:00", "7:60", "730", "7:3", "a:bc"]) expect(parse_alarm_time(bad)).toBeNull();
  });
});

describe("parse_when", () => {
  const zone = "Europe/Ljubljana";
  const now = Date.parse("2026-10-21T14:00:00Z");

  it("reads a duration as an instant from now", () => {
    expect(parse_when("10m", now, zone)).toEqual({ epoch: now + 600_000 });
    expect(parse_when("1h30m", now, zone)).toEqual({ epoch: now + 5_400_000 });
  });

  it("reads a bare time as the next one in the zone", () => {
    expect(parse_when("18:30", now, zone)).toEqual({ date: "2026-10-21", time: "18:30", tz: zone });
    expect(parse_when("9:00", now, zone)).toEqual({ date: "2026-10-22", time: "09:00", tz: zone });
    expect(parse_when("16:00", now, zone)).toEqual({ date: "2026-10-22", time: "16:00", tz: zone });
  });

  it("reads a day and a time", () => {
    expect(parse_when("tomorrow 9:00", now, zone)).toEqual({ date: "2026-10-22", time: "09:00", tz: zone });
    expect(parse_when("Today  18:30", now, zone)).toEqual({ date: "2026-10-21", time: "18:30", tz: zone });
    expect(parse_when("2026-12-24 18:00", now, zone)).toEqual({ date: "2026-12-24", time: "18:00", tz: zone });
  });

  it("rejects the past and anything else", () => {
    for (const bad of ["today 9:00", "2026-01-01 9:00", "soon", "tomorrow", "tomorrow 25:00", "next week 9:00", ""]) {
      expect(parse_when(bad, now, zone)).toBeNull();
    }
  });

  it("offers a quarter hour about half an hour ahead", () => {
    expect(when_examples(now, zone)[0]).toBe("16:30");
  });
});
