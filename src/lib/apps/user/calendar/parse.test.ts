import { describe, expect, test } from "vitest";
import { event_from_args, parse_day, parse_duration, parse_time } from "./parse";

const TODAY = "2026-10-15";

describe("parse_day", () => {
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
  ])("%s", (text, day) => expect(parse_day(text, TODAY)).toBe(day));

  test.each(["2027-02-29", "2026-13-01", "11-31", "32", "0", "fri", "", "2026/10/15"])("rejects %j", (text) => {
    expect(parse_day(text, TODAY)).toBeNull();
  });

  test("relative days cross years", () => {
    expect(parse_day("+1", "2026-12-31")).toBe("2027-01-01");
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

  test.each(["24:01", "25", "9:60", "9:5", "930", "nine", ""])("rejects %j", (text) => expect(parse_time(text)).toBeNull());
});

describe("parse_duration", () => {
  test.each([
    ["15", 15],
    ["0", 0],
    ["5m", 5],
    ["1h", 60],
    ["1h30m", 90],
    ["2d", 2880],
    ["1w", 10080],
    ["1D2H", 1560],
  ])("%s", (text, minutes) => expect(parse_duration(text)).toBe(minutes));

  test.each(["", "m", "30m1h", "1.5h", "-5", "soon"])("rejects %j", (text) => expect(parse_duration(text)).toBeNull());
});

describe("event_from_args", () => {
  test("no --at is all day", () => {
    const event = event_from_args({ title: ["Mom's", "birthday"], day: "12-24", repeat: "yearly" }, TODAY);
    expect(event).toMatchObject({ title: "Mom's birthday", day: "2026-12-24", all_day: true, repeat: { every: "yearly", until: null }, reminder: null });
  });

  test("--at alone lasts an hour, cut at midnight", () => {
    expect(event_from_args({ title: ["Call"], day: "today", at: "14:30" }, TODAY)).toMatchObject({ all_day: false, start: "14:30", end: "15:30" });
    expect(event_from_args({ title: ["Late"], day: "today", at: "23:30" }, TODAY)).toMatchObject({ start: "23:30", end: "24:00" });
  });

  test("--until and --remind", () => {
    expect(event_from_args({ title: ["Dentist"], day: "tomorrow", at: "9", until: "10:15", remind: "1h30m" }, TODAY)).toMatchObject({
      day: "2026-10-16",
      start: "09:00",
      end: "10:15",
      reminder: 90,
    });
  });

  test.each([
    [{ title: [], day: "today" }, /title/],
    [{ title: ["x"], day: "someday" }, /isn't a day/],
    [{ title: ["x"], day: "today", at: "25:00" }, /isn't a time/],
    [{ title: ["x"], day: "today", until: "10:00" }, /needs --at/],
    [{ title: ["x"], day: "today", at: "10:00", until: "09:00" }, /after --at/],
    [{ title: ["x"], day: "today", remind: "soon" }, /duration/],
  ])("rejects %j", (args, message) => {
    expect(() => event_from_args(args, TODAY)).toThrow(message);
  });
});
