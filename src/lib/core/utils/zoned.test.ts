import { describe, expect, it } from "vitest";
import {
  add_days,
  day_of_week,
  days_between,
  days_in_month,
  is_valid_zone,
  local_date,
  parse_date,
  parse_plain_time,
  wall_to_epoch,
  zone_offset,
} from "./zoned";

const HOUR = 3_600_000;
const day = (text: string) => parse_date(text)!;
const time = (text: string) => parse_plain_time(text)!;
const utc = (text: string) => Date.parse(text);

describe("zone_offset", () => {
  it("reads standard and summer time", () => {
    expect(zone_offset(utc("2026-01-15T12:00:00Z"), "Europe/Ljubljana")).toBe(HOUR);
    expect(zone_offset(utc("2026-07-15T12:00:00Z"), "Europe/Ljubljana")).toBe(2 * HOUR);
    expect(zone_offset(utc("2026-07-15T12:00:00Z"), "America/New_York")).toBe(-4 * HOUR);
    expect(zone_offset(utc("2026-07-15T12:00:00Z"), "Asia/Kolkata")).toBe(5.5 * HOUR);
    expect(zone_offset(utc("2026-07-15T12:00:00Z"), "UTC")).toBe(0);
  });
});

describe("wall_to_epoch", () => {
  it("converts an ordinary wall time", () => {
    expect(wall_to_epoch(day("2026-10-21"), time("09:30"), "Europe/Ljubljana")).toBe(utc("2026-10-21T07:30:00Z"));
    expect(wall_to_epoch(day("2026-10-21"), time("09:30"), "Asia/Tokyo")).toBe(utc("2026-10-21T00:30:00Z"));
  });

  it("shifts a time inside a spring-forward gap forward by the gap", () => {
    // New York jumps 02:00 → 03:00 on 2026-03-08.
    expect(wall_to_epoch(day("2026-03-08"), time("02:30"), "America/New_York")).toBe(utc("2026-03-08T07:30:00Z"));
    expect(local_date(utc("2026-03-08T07:30:00Z"), "America/New_York")).toEqual(day("2026-03-08"));
    // Ljubljana jumps 02:00 → 03:00 on 2026-03-29.
    expect(wall_to_epoch(day("2026-03-29"), time("02:30"), "Europe/Ljubljana")).toBe(utc("2026-03-29T01:30:00Z"));
    // The edges of the gap: 02:00 doesn't exist either, 03:00 does.
    expect(wall_to_epoch(day("2026-03-29"), time("02:00"), "Europe/Ljubljana")).toBe(utc("2026-03-29T01:00:00Z"));
    expect(wall_to_epoch(day("2026-03-29"), time("03:00"), "Europe/Ljubljana")).toBe(utc("2026-03-29T01:00:00Z"));
  });

  it("takes the first pass of a time a fall-back repeats", () => {
    // New York repeats 01:00–02:00 on 2026-11-01: 01:30 EDT (05:30Z) then 01:30 EST (06:30Z).
    expect(wall_to_epoch(day("2026-11-01"), time("01:30"), "America/New_York")).toBe(utc("2026-11-01T05:30:00Z"));
    expect(wall_to_epoch(day("2026-10-25"), time("02:30"), "Europe/Ljubljana")).toBe(utc("2026-10-25T00:30:00Z"));
  });

  it("handles a half-hour DST shift", () => {
    // Lord Howe goes +10:30 → +11 on 2026-10-04 at 02:00.
    expect(wall_to_epoch(day("2026-10-04"), time("02:15"), "Australia/Lord_Howe")).toBe(utc("2026-10-03T15:45:00Z"));
  });

  it("moves a time on a skipped day to the next day", () => {
    // Samoa skipped 2011-12-30 when it crossed the date line.
    const epoch = wall_to_epoch(day("2011-12-30"), time("09:00"), "Pacific/Apia");
    expect(local_date(epoch, "Pacific/Apia")).toEqual(day("2011-12-31"));
  });
});

describe("plain dates", () => {
  it("parses only real days", () => {
    expect(parse_date("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    for (const bad of ["2026-02-29", "2026-13-01", "2026-04-31", "2026-4-1", "26-04-01"]) expect(parse_date(bad)).toBeNull();
  });

  it("parses 24 h times", () => {
    expect(parse_plain_time("00:00")).toEqual({ hours: 0, minutes: 0 });
    for (const bad of ["24:00", "7:30", "12:60"]) expect(parse_plain_time(bad)).toBeNull();
  });

  it("does calendar arithmetic", () => {
    expect(days_in_month(2028, 2)).toBe(29);
    expect(days_in_month(2026, 2)).toBe(28);
    expect(days_in_month(2026, 12)).toBe(31);
    expect(add_days(day("2026-12-31"), 1)).toEqual(day("2027-01-01"));
    expect(add_days(day("2026-03-01"), -1)).toEqual(day("2026-02-28"));
    expect(days_between(day("2026-01-01"), day("2027-01-01"))).toBe(365);
    expect(day_of_week(day("2026-10-21"))).toBe(3);
  });

  it("knows a zone from a typo", () => {
    expect(is_valid_zone("Europe/Ljubljana")).toBe(true);
    expect(is_valid_zone("Europe/Atlantis")).toBe(false);
  });
});
