import { describe, expect, test } from "vitest";
import { add_time, format_usage, milestones, parse_usage, serialize_usage } from "./active-time";

const day = (date: number, hour = 12) => new Date(2026, 9, date, hour);

describe("add_time", () => {
  test("adds seconds, stamps the time and counts the first day", () => {
    const usage = add_time({}, "snake", 30, day(1));
    expect(usage.snake).toEqual({ seconds: 30, last: day(1).toISOString(), days: 1 });
  });

  test("a second stretch on the same day keeps the day count", () => {
    const usage = add_time(add_time({}, "snake", 30, day(1, 9)), "snake", 15.5, day(1, 22));
    expect(usage.snake.seconds).toBe(45.5);
    expect(usage.snake.days).toBe(1);
  });

  test("another day counts once", () => {
    let usage = add_time({}, "snake", 10, day(1));
    usage = add_time(usage, "snake", 10, day(2));
    usage = add_time(usage, "snake", 10, day(2, 18));
    expect(usage.snake.days).toBe(2);
  });

  test("nothing to add leaves it as it was", () => {
    const usage = {};
    expect(add_time(usage, "snake", 0, day(1))).toBe(usage);
  });

  test("other apps are untouched", () => {
    const usage = add_time(add_time({}, "snake", 10, day(1)), "paint", 5, day(1));
    expect(usage.snake.seconds).toBe(10);
    expect(usage.paint.seconds).toBe(5);
  });
});

describe("persistence", () => {
  test("round-trips", () => {
    const usage = add_time({}, "snake", 90, day(3));
    expect(parse_usage(serialize_usage(usage))).toEqual(usage);
  });

  test("broken or foreign files read as empty", () => {
    expect(parse_usage(null)).toEqual({});
    expect(parse_usage("{")).toEqual({});
    expect(parse_usage(JSON.stringify({ version: 2, apps: {} }))).toEqual({});
    expect(parse_usage(JSON.stringify({ version: 1, apps: { snake: { seconds: -1, last: "x" } } }))).toEqual({});
  });

  test("an entry without days counts one", () => {
    expect(parse_usage(JSON.stringify({ version: 1, apps: { snake: { seconds: 4, last: "x" } } })).snake.days).toBe(1);
  });
});

describe("format_usage", () => {
  test("reads like a person would say it", () => {
    expect(format_usage(20)).toBe("under a minute");
    expect(format_usage(25 * 60)).toBe("25 min");
    expect(format_usage(90 * 60)).toBe("1.5 h");
    expect(format_usage(12.7 * 3600)).toBe("12 h");
  });
});

describe("milestones", () => {
  test("follow time and days, worded for games", () => {
    const list = milestones({ seconds: 3700, last: "", days: 5 }, true);
    expect(list.filter((item) => item.done).map((item) => item.id)).toEqual(["first", "hour", "days-5"]);
    expect(list[1].label).toBe("Played for an hour");
    expect(milestones(null, false).every((item) => !item.done)).toBe(true);
  });
});
