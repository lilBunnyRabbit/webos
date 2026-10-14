import { describe, expect, test } from "vitest";
import { day_key, parse_time, resolve_day } from "./date";

const TODAY = "2026-10-15";

describe("day_key", () => {
  test("keys the local day", () => {
    expect(day_key(new Date(2026, 9, 4))).toBe("2026-10-04");
    expect(day_key(new Date(2026, 11, 31, 23, 59))).toBe("2026-12-31");
  });
});

describe("resolve_day", () => {
  test.each([
    ["today", "2026-10-15"],
    ["Yesterday", "2026-10-14"],
    ["tomorrow", "2026-10-16"],
    ["+20", "2026-11-04"],
    ["-15", "2026-09-30"],
    ["2027-02-28", "2027-02-28"],
    ["2027-2-3", "2027-02-03"],
    ["12-24", "2026-12-24"],
    ["3", "2026-10-03"],
    ["31", "2026-10-31"],
  ])("%s", (text, day) => expect(resolve_day(text, TODAY)).toBe(day));

  test.each(["2027-02-29", "2026-13-01", "11-31", "32", "0", "fri", "", "2026/10/15"])("rejects %j", (text) => {
    expect(resolve_day(text, TODAY)).toBeNull();
  });

  test("relative days cross years", () => {
    expect(resolve_day("+1", "2026-12-31")).toBe("2027-01-01");
  });
});

describe("parse_time", () => {
  test.each([
    ["9", "09:00"],
    ["09", "09:00"],
    ["9:30", "09:30"],
    ["23:59", "23:59"],
    ["24:00", "24:00"],
    ["0:05", "00:05"],
  ])("%s", (text, time) => expect(parse_time(text)).toBe(time));

  test.each(["24:01", "25", "9:60", "9:5", "930", "nine", ""])("rejects %j", (text) =>
    expect(parse_time(text)).toBeNull()
  );
});
