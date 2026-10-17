import { describe, expect, test } from "vitest";
import { TimeUnit, all_zones, format_in_zone, is_zone, parse_time, relative_time, time_rows } from "./time";

const NOW = Date.UTC(2026, 9, 17, 12, 0, 0);

describe("parse_time", () => {
  test("guesses the unit of a bare number from its size", () => {
    expect(parse_time("1700000000")).toEqual({ ok: true, ms: 1_700_000_000_000, unit: TimeUnit.SECONDS });
    expect(parse_time("1700000000123")).toEqual({ ok: true, ms: 1_700_000_000_123, unit: TimeUnit.MILLISECONDS });
    expect(parse_time("1700000000123456")).toEqual({ ok: true, ms: 1_700_000_000_123, unit: TimeUnit.MICROSECONDS });
    expect(parse_time("1700000000123456789")).toMatchObject({ ok: true, unit: TimeUnit.NANOSECONDS });
    expect(parse_time("-86400")).toEqual({ ok: true, ms: -86_400_000, unit: TimeUnit.SECONDS });
  });

  test("reads dates and now", () => {
    expect(parse_time("2026-10-17T12:00:00Z")).toEqual({ ok: true, ms: NOW, unit: TimeUnit.DATE });
    expect(parse_time("  now ", NOW)).toEqual({ ok: true, ms: NOW, unit: TimeUnit.NOW });
    expect(parse_time("", NOW)).toEqual({ ok: true, ms: NOW, unit: TimeUnit.NOW });
  });

  test("rejects what isn't a time", () => {
    expect(parse_time("tomorrowish").ok).toBe(false);
  });
});

describe("relative_time", () => {
  test("picks the largest whole unit", () => {
    expect(relative_time(NOW, NOW)).toBe("now");
    expect(relative_time(NOW - 3 * 86_400_000, NOW)).toBe("3 days ago");
    expect(relative_time(NOW + 2 * 3_600_000, NOW)).toBe("in 2 hours");
    expect(relative_time(NOW - 400 * 86_400_000, NOW)).toBe("1 year ago");
  });
});

describe("zones", () => {
  test("lists UTC and checks names", () => {
    expect(all_zones()).toContain("UTC");
    expect(is_zone("Europe/Ljubljana")).toBe(true);
    expect(is_zone("Mars/Olympus")).toBe(false);
  });

  test("formats in a zone with its offset", () => {
    expect(format_in_zone(NOW, "Europe/Ljubljana")).toBe("2026-10-17 14:00:00 GMT+2");
    expect(format_in_zone(NOW, "UTC")).toBe("2026-10-17 12:00:00 GMT");
  });

  test("rows cover unix, ISO and relative", () => {
    const rows = Object.fromEntries(time_rows(NOW, "UTC", NOW).map((row) => [row.label, row.value]));
    expect(rows["Unix seconds"]).toBe("1792238400");
    expect(rows["ISO 8601"]).toBe("2026-10-17T12:00:00.000Z");
    expect(rows.Weekday).toBe("Saturday");
    expect(rows.Relative).toBe("now");
  });
});
