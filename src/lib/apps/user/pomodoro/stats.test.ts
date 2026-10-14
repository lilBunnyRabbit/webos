import { describe, expect, it } from "vitest";
import { EMPTY_STATS, format_minutes, last_days, record_focus, streak, totals, type StatsFile } from "./stats";

const at = (day: number, hour = 10) => new Date(2026, 9, day, hour).getTime();
const MIN = 60_000;

function with_days(...days: number[]): StatsFile {
  return days.reduce((stats, day) => record_focus(stats, at(day), 25 * MIN), EMPTY_STATS);
}

describe("stats", () => {
  it("records sessions and minutes on the local day they ended", () => {
    let stats = record_focus(EMPTY_STATS, at(14), 25 * MIN);
    stats = record_focus(stats, at(14, 23), 50 * MIN);
    expect(stats.days["2026-10-14"]).toEqual({ sessions: 2, ms: 75 * MIN });
    expect(EMPTY_STATS.days).toEqual({});
  });

  it("lists the last 7 days, oldest first, zeros included", () => {
    const days = last_days(with_days(14, 14, 10), new Date(at(14)));
    expect(days.map((day) => day.day)).toEqual(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(days.map((day) => day.sessions)).toEqual([0, 0, 1, 0, 0, 0, 2]);
  });

  it("crosses month ends", () => {
    expect(last_days(EMPTY_STATS, new Date(2026, 10, 2), 3).map((day) => day.day)).toEqual(["2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("counts a streak ending today", () => {
    expect(streak(with_days(12, 13, 14), new Date(at(14)))).toBe(3);
  });

  it("keeps yesterday's streak while today is still empty", () => {
    expect(streak(with_days(12, 13), new Date(at(14)))).toBe(2);
  });

  it("breaks on a missed day", () => {
    expect(streak(with_days(10, 11, 13), new Date(at(14)))).toBe(1);
    expect(streak(with_days(10, 11), new Date(at(14)))).toBe(0);
  });

  it("totals everything", () => {
    expect(totals(with_days(1, 2, 2))).toEqual({ sessions: 3, ms: 75 * MIN });
  });

  it("formats minutes", () => {
    expect(format_minutes(25 * MIN)).toBe("25 min");
    expect(format_minutes(65 * MIN)).toBe("1 h 05 min");
  });
});
