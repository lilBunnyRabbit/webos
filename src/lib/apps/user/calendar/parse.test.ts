import { describe, expect, test } from "vitest";
import { event_from_args, parse_duration } from "./parse";

const TODAY = "2026-10-15";

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
    expect(event).toMatchObject({
      title: "Mom's birthday",
      day: "2026-12-24",
      all_day: true,
      repeat: { every: "yearly", until: null },
      reminder: null,
    });
  });

  test("--at alone lasts an hour, cut at midnight", () => {
    expect(event_from_args({ title: ["Call"], day: "today", at: "14:30" }, TODAY)).toMatchObject({
      all_day: false,
      start: "14:30",
      end: "15:30",
    });
    expect(event_from_args({ title: ["Late"], day: "today", at: "23:30" }, TODAY)).toMatchObject({
      start: "23:30",
      end: "24:00",
    });
  });

  test("--until and --remind", () => {
    expect(
      event_from_args({ title: ["Dentist"], day: "tomorrow", at: "9", until: "10:15", remind: "1h30m" }, TODAY)
    ).toMatchObject({
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
