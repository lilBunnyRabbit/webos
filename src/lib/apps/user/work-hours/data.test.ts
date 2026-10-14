import { describe, expect, it } from "vitest";
import {
  add_entry,
  calendar_weeks,
  clock_time,
  day_minutes,
  day_span,
  empty_month,
  entry_error,
  entry_minutes,
  format_hours,
  iso_week,
  month_minutes,
  parse_month_file,
  parse_state_file,
  parse_target,
  remove_entry,
  serialize,
  set_note,
  shift_month,
  split_session,
  update_entry,
  week_minutes,
  worked_days,
  type MonthFile,
} from "./data";
import { month_report_html } from "./report";

const entry = (id: string, start: string, end: string, description = "") => ({ id, start, end, description });

function october(): MonthFile {
  let file = empty_month("2026-10");
  file = add_entry(file, "2026-10-01", entry("a", "09:00", "12:30", "Planning"));
  file = add_entry(file, "2026-10-01", entry("b", "13:00", "17:00", "Review"));
  file = add_entry(file, "2026-10-05", entry("c", "08:15", "16:45"));
  file = set_note(file, "2026-10-05", "Release day");
  return { ...file, target_hours: 160 };
}

describe("parse and serialize", () => {
  it("round-trips a month", () => {
    const file = october();
    expect(parse_month_file(serialize(file))).toEqual(file);
  });

  it("rejects other versions, bad keys and broken JSON", () => {
    expect(parse_month_file(JSON.stringify({ ...october(), version: 2 }))).toBeNull();
    expect(parse_month_file(JSON.stringify({ ...october(), days: { "2026-10-32": { entries: [], note: "" } } }))).toBeNull();
    expect(parse_month_file(JSON.stringify({ ...october(), days: { "2026-10-02": { entries: [entry("x", "9:00", "10:00")], note: "" } } }))).toBeNull();
    expect(parse_month_file("{")).toBeNull();
  });

  it("parses the state file", () => {
    const state = { version: 1, running: { start: "2026-10-14T07:00:00.000Z", description: "" } };
    expect(parse_state_file(serialize(state as never))).toEqual(state);
    expect(parse_state_file(JSON.stringify({ version: 1, running: { start: "yesterday", description: "" } }))).toBeNull();
    expect(parse_state_file(JSON.stringify({ version: 1, running: null }))).toEqual({ version: 1, running: null });
  });

  it("writes pretty JSON with a trailing newline", () => {
    expect(serialize(empty_month("2026-10"))).toBe('{\n  "version": 1,\n  "month": "2026-10",\n  "target_hours": null,\n  "days": {}\n}\n');
  });
});

describe("totals", () => {
  it("sums entries, days, weeks and the month", () => {
    const file = october();
    expect(entry_minutes(entry("x", "09:00", "12:30"))).toBe(210);
    expect(day_minutes(file.days["2026-10-01"])).toBe(450);
    expect(month_minutes(file)).toBe(450 + 510);
    expect(worked_days(file)).toBe(2);
    expect(week_minutes(file).map((week) => [week.week, week.minutes])).toEqual([
      [40, 450],
      [41, 510],
      [42, 0],
      [43, 0],
      [44, 0],
    ]);
  });

  it("counts an end at or before the start as zero", () => {
    expect(entry_minutes(entry("x", "10:00", "09:00"))).toBe(0);
    expect(entry_minutes(entry("x", "22:00", "24:00"))).toBe(120);
  });

  it("finds the day's first start and last end", () => {
    expect(day_span(october().days["2026-10-01"])).toEqual({ start: "09:00", end: "17:00" });
    expect(day_span(undefined)).toBeNull();
  });

  it("formats hours and minutes", () => {
    expect(format_hours(0)).toBe("0:00");
    expect(format_hours(450)).toBe("7:30");
    expect(format_hours(9_605)).toBe("160:05");
  });
});

describe("editing", () => {
  it("updates and removes entries, dropping empty days", () => {
    let file = october();
    file = update_entry(file, "2026-10-01", entry("a", "08:00", "12:30", "Planning"));
    expect(day_minutes(file.days["2026-10-01"])).toBe(510);
    file = remove_entry(remove_entry(file, "2026-10-01", "a"), "2026-10-01", "b");
    expect(file.days["2026-10-01"]).toBeUndefined();
    file = remove_entry(file, "2026-10-05", "c");
    expect(file.days["2026-10-05"]).toEqual({ entries: [], note: "Release day" });
    expect(set_note(file, "2026-10-05", "").days["2026-10-05"]).toBeUndefined();
  });

  it("refuses a day from another month", () => {
    expect(() => add_entry(empty_month("2026-10"), "2026-11-01", entry("x", "09:00", "10:00"))).toThrow();
  });

  it("validates entries and targets", () => {
    expect(entry_error("09:00", "17:00")).toBeNull();
    expect(entry_error("17:00", "09:00")).toMatch(/after/);
    expect(entry_error("", "09:00")).toMatch(/start/);
    expect(parse_target("160")).toBe(160);
    expect(parse_target("152,5")).toBe(152.5);
    expect(parse_target("")).toBeNull();
    expect(parse_target("lots")).toBeUndefined();
  });
});

describe("calendar", () => {
  it("lays out Monday-first weeks with ISO numbers", () => {
    const weeks = calendar_weeks("2026-10");
    expect(weeks[0].days).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(weeks.at(-1)!.days.filter(Boolean).at(-1)).toBe("2026-10-31");
    expect(weeks.every((week) => week.days.length === 7)).toBe(true);
  });

  it("numbers weeks across year ends", () => {
    expect(iso_week("2026-01-01")).toBe(1);
    expect(iso_week("2027-01-01")).toBe(53);
    expect(iso_week("2024-12-30")).toBe(1);
  });

  it("shifts months across years", () => {
    expect(shift_month("2026-01", -1)).toBe("2025-12");
    expect(shift_month("2026-12", 1)).toBe("2027-01");
  });
});

describe("sessions", () => {
  it("reads clock times in whole minutes", () => {
    expect(clock_time(new Date(2026, 9, 14, 9, 4, 59))).toBe("09:04");
    expect(clock_time(new Date(2026, 9, 14, 23, 59, 59))).toBe("23:59");
  });

  it("keeps a same-day session whole", () => {
    expect(split_session(new Date(2026, 9, 14, 9, 0), new Date(2026, 9, 14, 17, 30))).toEqual([{ day: "2026-10-14", start: "09:00", end: "17:30" }]);
  });

  it("splits at midnight, also into the next month", () => {
    expect(split_session(new Date(2026, 9, 31, 22, 0), new Date(2026, 10, 1, 1, 15))).toEqual([
      { day: "2026-10-31", start: "22:00", end: "24:00" },
      { day: "2026-11-01", start: "00:00", end: "01:15" },
    ]);
  });

  it("drops sessions under a minute", () => {
    expect(split_session(new Date(2026, 9, 14, 9, 0, 0), new Date(2026, 9, 14, 9, 0, 20))).toEqual([]);
  });
});

describe("report", () => {
  it("lists every day, the totals and the notes, escaped", () => {
    const file = set_note(october(), "2026-10-07", "<b>offsite</b>");
    const html = month_report_html(file, { generated: new Date(2026, 9, 31) });
    expect(html).toContain("@page");
    expect(html).toContain("size: A4");
    expect(html.match(/<tr class="(?:weekend)?">/g)).toHaveLength(31);
    expect(html).toContain("16:00");
    expect(html).toContain("Planning; Review");
    expect(html).toContain("Release day");
    expect(html).toContain("&lt;b&gt;offsite&lt;/b&gt;");
    expect(html).not.toContain("<b>offsite");
    expect(html).toContain("(10%)");
  });
});
