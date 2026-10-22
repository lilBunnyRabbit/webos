import { describe, expect, it } from "vitest";
import { activity_list, add_activity, DEFAULT_ACTIVITIES, toggle_id, update_activity } from "./activities";
import { mood_line } from "./export";
import { index_entry, type Entry } from "./journal";
import {
  activity_stats,
  add_months,
  day_stats,
  month_grid,
  on_this_day,
  split_stat,
  week_series,
  week_start,
} from "./mood";

const ID = "a".repeat(32);

function entry(date: string, extra: Partial<Entry> = {}): Entry {
  return { id: ID, date, created: 0, updated: 0, body: "", ...extra };
}

describe("days", () => {
  it("a mood alone is a day written; moods average per day", () => {
    const days = day_stats([
      { date: "2026-10-01", mood: 5 },
      { date: "2026-10-01", mood: 2, activities: ["work"] },
      { date: "2026-10-02" },
    ]);
    expect(days.get("2026-10-01")).toMatchObject({ entries: 2, mood: 3.5 });
    expect([...days.get("2026-10-01")!.activities]).toEqual(["work"]);
    expect(days.get("2026-10-02")?.mood).toBeNull();
  });

  it("titles a mood-only entry by its mood", () => {
    expect(index_entry(entry("2026-10-01", { mood: 4 })).title).toBe("Feeling good");
    expect(index_entry(entry("2026-10-01", { mood: 4, body: "Lunch" })).title).toBe("Lunch");
  });
});

describe("calendar math", () => {
  it("weeks start on Monday and months pad to whole weeks", () => {
    expect(week_start("2026-10-22")).toBe("2026-10-19");
    expect(week_start("2026-10-19")).toBe("2026-10-19");
    const grid = month_grid("2026-10");
    expect(grid[0].slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(grid.flat().filter(Boolean)).toHaveLength(31);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(add_months("2026-01", -1)).toBe("2025-12");
    expect(add_months("2026-11", 2)).toBe("2027-01");
  });

  it("averages days per week, oldest first, gaps as null", () => {
    const days = day_stats([
      { date: "2026-10-19", mood: 4 },
      { date: "2026-10-20", mood: 2 },
      { date: "2026-10-20", mood: 2 },
      { date: "2026-10-05", mood: 5 },
    ]);
    const weeks = week_series(days, "2026-10-22", 3);
    expect(weeks.map((week) => week.start)).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
    expect(weeks.map((week) => week.mood)).toEqual([5, null, 3]);
    expect(weeks[2].days).toBe(2);
  });
});

describe("correlations", () => {
  it("compares days with an activity against days without", () => {
    const days = day_stats([
      { date: "2026-10-01", mood: 5, activities: ["walk"] },
      { date: "2026-10-02", mood: 4, activities: ["walk", "work"] },
      { date: "2026-10-03", mood: 2, activities: ["work"] },
      { date: "2026-10-04", mood: 1, activities: ["work"] },
      { date: "2026-10-05", activities: ["walk"] },
    ]);
    const stats = activity_stats(days.values());
    expect(stats.map((stat) => stat.id)).toEqual(["walk", "work"]);
    expect(stats[0]).toMatchObject({ days: 2, mood: 4.5, difference: 3 });
    expect(stats[1].mood).toBeCloseTo(7 / 3);
  });

  it("splits by median sleep and needs four days", () => {
    const few = day_stats([{ date: "2026-10-01", mood: 3, sleep: 8 }]);
    expect(split_stat(few.values(), "sleep")).toBeNull();
    const days = day_stats([
      { date: "2026-10-01", mood: 5, sleep: 8 },
      { date: "2026-10-02", mood: 4, sleep: 9 },
      { date: "2026-10-03", mood: 2, sleep: 5 },
      { date: "2026-10-04", mood: 1, sleep: 6 },
    ]);
    expect(split_stat(days.values(), "sleep")).toEqual({ threshold: 8, above: 4.5, below: 1.5, days: 4 });
  });
});

describe("on this day", () => {
  it("finds the same date in earlier years and the same day in earlier months", () => {
    const entries = [entry("2025-10-22"), entry("2024-10-22"), entry("2026-09-22"), entry("2026-01-22"), entry("2025-11-22"), entry("2026-10-21")];
    const found = on_this_day(entries, "2026-10-22");
    expect(found.map((group) => [group.date, group.label])).toEqual([
      ["2026-09-22", "A month ago"],
      ["2026-01-22", "9 months ago"],
      ["2025-11-22", "11 months ago"],
      ["2025-10-22", "A year ago"],
      ["2024-10-22", "2 years ago"],
    ]);
  });

  it("skips months without the day", () => {
    expect(on_this_day([entry("2026-02-28")], "2026-03-31")).toEqual([]);
  });
});

describe("activities", () => {
  it("keeps the journal's list and adds defaults it doesn't know", () => {
    expect(activity_list(undefined)).toEqual(DEFAULT_ACTIVITIES);
    const renamed = update_activity(activity_list(undefined), "work", { label: "Office", hidden: true });
    const stored = add_activity(renamed.slice(0, 3), "Climbing", "exercise");
    const list = activity_list(stored);
    expect(list.find((activity) => activity.id === "work")).toMatchObject({ label: "Office", hidden: true });
    expect(list.find((activity) => activity.label === "Climbing")?.id).toMatch(/^c-[0-9a-f]{12}$/);
    expect(list).toHaveLength(DEFAULT_ACTIVITIES.length + 1);
    expect(add_activity(list, "   ", "star")).toHaveLength(list.length);
  });

  it("toggles ids and drops an empty list", () => {
    expect(toggle_id(undefined, "work")).toEqual(["work"]);
    expect(toggle_id(["work"], "work")).toBeUndefined();
  });

  it("writes a mood line for exports", () => {
    const line = mood_line(entry("2026-10-01", { mood: 5, activities: ["walk", "c-1"], energy: 7, sleep: 7.5 }), new Map([["walk", "Walk"]]));
    expect(line).toBe("Mood: Great · Walk, c-1 · Energy 7/10 · Sleep 7.5 h");
    expect(mood_line(entry("2026-10-01"))).toBe("");
  });
});
