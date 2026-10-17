import { describe, expect, test } from "vitest";
import { describe_cron, next_runs, parse_cron, type CronSchedule } from "./cron";

function schedule(expression: string): CronSchedule {
  const result = parse_cron(expression);
  if (!result.ok) throw new Error(result.error);
  return result.schedule;
}

const local = (date: Date) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;

describe("parse_cron", () => {
  test("ranges, steps, lists and names", () => {
    const parsed = schedule("*/15 9-17/4 1,15 jan-mar MON-fri");
    expect([...parsed.minute.values]).toEqual([0, 15, 30, 45]);
    expect([...parsed.hour.values]).toEqual([9, 13, 17]);
    expect([...parsed.day.values]).toEqual([1, 15]);
    expect([...parsed.month.values]).toEqual([1, 2, 3]);
    expect([...parsed.weekday.values]).toEqual([1, 2, 3, 4, 5]);
  });

  test("7 is Sunday, and a start with a step runs to the end", () => {
    expect([...schedule("0 0 * * 7").weekday.values]).toEqual([0]);
    expect([...schedule("50/5 * * * *").minute.values]).toEqual([50, 55]);
  });

  test("macros expand", () => {
    expect(schedule("@daily")).toEqual(schedule("0 0 * * *"));
    expect(parse_cron("@reboot").ok).toBe(false);
  });

  test.each([
    ["* * * *", /five fields/],
    ["60 * * * *", /minute: 60 is outside 0–59/],
    ["* * * foo *", /month: "foo"/],
    ["*/0 * * * *", /step "0"/],
    ["* 5-2 * * *", /backwards/],
    ["1-2-3 * * * *", /isn't a range/],
  ])("rejects %s", (expression, error) => {
    const result = parse_cron(expression);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(error);
  });
});

describe("next_runs", () => {
  const from = new Date(2026, 4, 13, 10, 7);

  test("every 15 minutes in working hours", () => {
    expect(next_runs(schedule("*/15 9-17 * * *"), from, 3).map(local)).toEqual([
      "2026-5-13 10:15",
      "2026-5-13 10:30",
      "2026-5-13 10:45",
    ]);
  });

  test("weekdays only skip the weekend", () => {
    expect(next_runs(schedule("0 9 * * mon-fri"), new Date(2026, 4, 15, 12, 0), 2).map(local)).toEqual([
      "2026-5-18 9:00",
      "2026-5-19 9:00",
    ]);
  });

  test("both day fields restricted match either", () => {
    const runs = next_runs(schedule("0 0 1 * mon"), new Date(2026, 4, 26, 12, 0), 3).map(local);
    expect(runs).toEqual(["2026-6-1 0:00", "2026-6-8 0:00", "2026-6-15 0:00"]);
  });

  test("leap days wait for a leap year; impossible dates never run", () => {
    expect(next_runs(schedule("0 12 29 2 *"), from, 2).map(local)).toEqual(["2028-2-29 12:00", "2032-2-29 12:00"]);
    expect(next_runs(schedule("0 0 31 2 *"), from, 3)).toEqual([]);
  });

  test("never the start minute itself", () => {
    expect(next_runs(schedule("7 10 * * *"), from, 1).map(local)).toEqual(["2026-5-14 10:07"]);
  });
});

describe("describe_cron", () => {
  test.each([
    ["* * * * *", "Every minute"],
    ["*/15 9-17 * * 1-5", "Every 15 minutes, between 09:00 and 17:59, on Monday through Friday"],
    ["0 9 * * 1", "At 09:00, on Monday"],
    ["30 8,12,18 * * *", "At 08:30, 12:30 and 18:30"],
    ["5 * * * *", "At minute 5 of every hour"],
    ["0 */2 * * *", "At minute 0, every 2 hours"],
    ["0 0 1,15 * *", "At 00:00, on the 1st and 15th of the month"],
    ["0 0 1 * mon", "At 00:00, on the 1st of the month or on Monday"],
    ["@yearly", "At 00:00, on the 1st of the month, in January"],
    ["0 12 * jun-aug sat,sun", "At 12:00, on Saturday and Sunday, in June through August"],
    ["0-10 3 * * *", "At minutes 0 through 10, during hour 03"],
  ])("%s", (expression, text) => {
    expect(describe_cron(schedule(expression))).toBe(text);
  });
});
