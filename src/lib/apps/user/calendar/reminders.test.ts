import { describe, expect, it } from "vitest";
import type { Job } from "$lib/core/api/services/scheduler";
import { next_occurrence } from "$lib/core/api/services/scheduler/occurrence";
import { wall_to_epoch } from "$lib/core/utils/zoned";
import { add_days, EventColor, new_draft, occurrences, Repeat, type CalendarEvent } from "./calendar";
import { event_from_args } from "./parse";
import { event_id_of, next_reminder, reminder_error, reminder_input, reminder_job_id, reminder_plan, same_timing, type ReminderRule } from "./reminders";

function event(patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e1",
    title: "Standup",
    day: "2026-10-14",
    all_day: false,
    start: "10:00",
    end: "11:00",
    repeat: null,
    skip: [],
    notes: "",
    color: EventColor.PRIMARY,
    reminder: 15,
    ...patch,
  };
}

function rule_of(patch: Partial<CalendarEvent>): ReminderRule {
  const plan = reminder_plan(event(patch));
  if (plan.kind !== "rule") throw new Error(`expected a rule, got ${plan.kind}`);
  return plan.rule;
}

const unsupported = (patch: Partial<CalendarEvent>) => reminder_plan(event(patch)).kind === "unsupported";
const monthly = { every: Repeat.MONTHLY, until: null };
const yearly = { every: Repeat.YEARLY, until: null };

describe("reminder_plan", () => {
  it("has none without a reminder", () => {
    expect(reminder_plan(event({ reminder: null }))).toEqual({ kind: "none" });
  });

  it("folds the minutes into the wall time, onto the day before when it crosses midnight", () => {
    expect(rule_of({})).toEqual({ date: "2026-10-14", time: "09:45", shift: 0 });
    expect(rule_of({ start: "00:30", reminder: 60 })).toEqual({ date: "2026-10-13", time: "23:30", shift: 1 });
    expect(rule_of({ start: "00:00", reminder: 0 })).toEqual({ date: "2026-10-14", time: "00:00", shift: 0 });
    expect(rule_of({ reminder: 1440 })).toEqual({ date: "2026-10-13", time: "10:00", shift: 1 });
    expect(rule_of({ reminder: 10080 })).toEqual({ date: "2026-10-07", time: "10:00", shift: 7 });
    expect(rule_of({ start: "08:00", reminder: 3000 })).toEqual({ date: "2026-10-12", time: "06:00", shift: 2 });
  });

  it("counts an all-day event from 09:00", () => {
    expect(rule_of({ all_day: true, reminder: 0 })).toMatchObject({ date: "2026-10-14", time: "09:00" });
    expect(rule_of({ all_day: true, reminder: 1440 })).toMatchObject({ date: "2026-10-13", time: "09:00", shift: 1 });
    expect(rule_of({ all_day: true, reminder: 600 })).toMatchObject({ date: "2026-10-13", time: "23:00", shift: 1 });
  });

  it("moves until and skipped days back with the reminder", () => {
    const rule = rule_of({ reminder: 1440, repeat: { every: Repeat.DAILY, until: "2026-10-20" }, skip: ["2026-10-16"] });
    expect(rule.repeat).toEqual({ every: "day", until: "2026-10-19", skip: ["2026-10-15"] });
    expect(rule_of({ repeat: { every: Repeat.DAILY, until: "2026-10-20" } }).repeat).toEqual({ every: "day", until: "2026-10-20" });
  });

  it("repeats weekly on the reminder's own weekday", () => {
    expect(rule_of({ repeat: { every: Repeat.WEEKLY, until: null } }).repeat).toEqual({ every: "week", days: [3] });
    expect(rule_of({ start: "00:15", reminder: 30, repeat: { every: Repeat.WEEKLY, until: null } })).toMatchObject({
      date: "2026-10-13",
      time: "23:45",
      repeat: { every: "week", days: [2] },
    });
    expect(rule_of({ day: "2026-10-12", reminder: 1440, repeat: { every: Repeat.WEEKLY, until: null } }).repeat).toEqual({ every: "week", days: [0] });
  });

  it("repeats monthly on the day it lands on, or the month's end", () => {
    expect(rule_of({ day: "2026-01-15", reminder: 1440, repeat: monthly }).repeat).toEqual({ every: "month", day: 14 });
    expect(rule_of({ day: "2026-01-31", repeat: monthly }).repeat).toEqual({ every: "month", day: 31 });
    expect(rule_of({ day: "2026-04-30", repeat: monthly }).repeat).toEqual({ every: "month", day: 30 });
    expect(rule_of({ day: "2026-01-10", reminder: 10080, repeat: monthly }).repeat).toEqual({ every: "month", day: 3 });
    // The day before the 1st, or a week before the 7th, is always the previous month's last day.
    expect(rule_of({ day: "2026-05-01", reminder: 1440, repeat: monthly })).toMatchObject({ date: "2026-04-30", repeat: { every: "month", day: 31 } });
    expect(rule_of({ day: "2026-03-07", reminder: 10080, repeat: monthly })).toMatchObject({ date: "2026-02-28", repeat: { every: "month", day: 31 } });
    expect(rule_of({ day: "2026-03-01", start: "00:10", reminder: 15, repeat: monthly })).toMatchObject({ time: "23:55", repeat: { every: "month", day: 31 } });
  });

  it("refuses a monthly reminder whose day of the month would change with the month's length", () => {
    expect(unsupported({ day: "2026-01-31", reminder: 1440, repeat: monthly })).toBe(true);
    expect(unsupported({ day: "2026-01-29", reminder: 1440, repeat: monthly })).toBe(true);
    expect(unsupported({ day: "2026-01-30", start: "00:10", reminder: 15, repeat: monthly })).toBe(true);
    expect(unsupported({ day: "2026-01-05", reminder: 10080, repeat: monthly })).toBe(true);
    expect(unsupported({ day: "2026-01-28", reminder: 1440, repeat: monthly })).toBe(false);
  });

  it("repeats yearly unless the reminder's day moves with 29 February", () => {
    expect(rule_of({ day: "2026-12-01", reminder: 10080, repeat: yearly })).toMatchObject({ date: "2026-11-24", repeat: { every: "year" } });
    expect(rule_of({ day: "2027-01-03", reminder: 10080, repeat: yearly })).toMatchObject({ date: "2026-12-27", repeat: { every: "year" } });
    expect(rule_of({ day: "2028-02-29", repeat: yearly })).toMatchObject({ date: "2028-02-29", repeat: { every: "year" } });
    // From a leap year, the day before 1 March is 29 February, which the scheduler clamps to the 28th in other years.
    expect(rule_of({ day: "2028-03-01", reminder: 1440, repeat: yearly })).toMatchObject({ date: "2028-02-29", repeat: { every: "year" } });
    expect(unsupported({ day: "2027-03-01", reminder: 1440, repeat: yearly })).toBe(true);
    expect(unsupported({ day: "2028-02-29", reminder: 1440, repeat: yearly })).toBe(true);
    expect(unsupported({ day: "2026-03-05", reminder: 10080, repeat: yearly })).toBe(true);
  });
});

// Every plan the scheduler takes must fire exactly at Calendar's own reminder times: each occurrence's start (09:00
// all day) minus the minutes. In UTC wall time and elapsed time agree, so this is the old reminder rule exactly.
describe("against Calendar's occurrences", () => {
  const days = ["2024-01-01", "2024-01-31", "2024-02-29", "2024-03-01", "2024-03-07", "2025-02-28", "2025-03-01", "2026-04-30", "2026-05-31", "2026-08-15", "2027-12-31"];
  const minutes = [0, 15, 60, 1440, 2880, 10080];
  const repeats = [null, { every: Repeat.DAILY, until: null }, { every: Repeat.WEEKLY, until: null }, monthly, yearly];
  const SPAN: Record<string, number> = { [Repeat.DAILY]: 160, [Repeat.WEEKLY]: 500, [Repeat.MONTHLY]: 900, [Repeat.YEARLY]: 900 };

  it("fires on every occurrence and nothing else, until and skips included", () => {
    let checked = 0;
    for (const day of days)
      for (const reminder of minutes)
        for (const repeat of repeats)
          for (const [all_day, start] of [[false, "00:10"], [false, "13:45"], [true, "09:00"]] as const) {
            // Daily and weekly cross every month end well within their span; a long one only multiplies the walk.
            const span = repeat ? SPAN[repeat.every] : 0;
            const until = repeat ? add_days(day, span - 100) : null;
            const subject = event({ day, reminder, all_day, start, repeat: repeat && { ...repeat, until }, skip: repeat ? [add_days(day, 0), add_days(day, Math.floor(span / 2))] : [] });
            const plan = reminder_plan(subject);
            if (plan.kind !== "rule") continue;
            const base = all_day ? "09:00" : start;
            const expected = occurrences(subject, day, add_days(day, span || 900)).map((on) => Date.parse(`${on}T${base}:00Z`) - reminder * 60_000);
            const job = { at: { date: plan.rule.date, time: plan.rule.time, tz: "UTC" }, repeat: plan.rule.repeat, armed: true };
            const fired: number[] = [];
            for (let after = -Infinity, next = next_occurrence(job, after); next !== null && fired.length <= expected.length; after = next, next = next_occurrence(job, after)) fired.push(next);
            expect(fired, `${day} ${start} ${all_day} ${reminder} ${repeat?.every}`).toEqual(expected);
            checked++;
          }
    expect(checked).toBeGreaterThan(500);
  });
});

describe("reminder_input", () => {
  const zone = "Europe/Ljubljana";
  const now = wall_to_epoch({ year: 2026, month: 10, day: 14 }, { hours: 12, minutes: 0 }, zone);

  it("is a reminder job that opens Calendar on the event's day", () => {
    expect(reminder_input(event({ day: "2026-10-15" }), zone, now)).toEqual({
      key: "reminder-e1",
      title: "Standup",
      message: "10:00–11:00 · in 15 min",
      at: { date: "2026-10-15", time: "09:45", tz: zone },
      kind: "reminder",
      open: { app: "calendar", props: { day: "2026-10-15" } },
    });
    expect(reminder_input(event({ all_day: true, reminder: 1440, day: "2026-10-16" }), zone, now)?.message).toBe("All day · tomorrow");
    expect(reminder_input(event({ reminder: 0, day: "2026-10-16" }), zone, now)?.message).toBe("10:00–11:00 · now");
  });

  it("opens the day of the first occurrence still ahead", () => {
    const daily = event({ day: "2026-10-01", reminder: 1440, repeat: { every: Repeat.DAILY, until: null }, skip: ["2026-10-16"] });
    expect(reminder_input(daily, zone, now)?.open?.props).toEqual({ day: "2026-10-17" });
  });

  it("is null when no reminder is left", () => {
    expect(reminder_input(event({ day: "2026-10-14", start: "12:10", reminder: 15 }), zone, now)).toBeNull();
    expect(reminder_input(event({ day: "2026-10-01", repeat: { every: Repeat.DAILY, until: "2026-10-13" } }), zone, now)).toBeNull();
    expect(reminder_input(event({ reminder: null, day: "2026-10-20" }), zone, now)).toBeNull();
    expect(reminder_input(event({ day: "2026-10-31", reminder: 1440, repeat: monthly }), zone, now)).toBeNull();
  });

  it("keeps the wall time across DST: a day before is the same clock time the day before", () => {
    const daily = event({ day: "2026-03-27", start: "08:00", reminder: 1440, repeat: { every: Repeat.DAILY, until: null } });
    const input = reminder_input(daily, zone, wall_to_epoch({ year: 2026, month: 3, day: 26 }, { hours: 0, minutes: 0 }, zone))!;
    const job = { ...input, armed: true };
    const saturday = next_occurrence(job, wall_to_epoch({ year: 2026, month: 3, day: 28 }, { hours: 0, minutes: 0 }, zone))!;
    const sunday = next_occurrence(job, saturday)!;
    expect(sunday - saturday).toBe(23 * 3_600_000);
    expect(sunday).toBe(wall_to_epoch({ year: 2026, month: 3, day: 29 }, { hours: 8, minutes: 0 }, zone));
  });
});

describe("helpers", () => {
  it("maps job ids to events", () => {
    expect(reminder_job_id("ab12")).toBe("calendar:reminder-ab12");
    expect(event_id_of("calendar:reminder-ab12")).toBe("ab12");
    expect(event_id_of("clock:alarm-1")).toBeNull();
  });

  it("compares timing whatever the key order or zone", () => {
    const job = { at: { date: "2026-10-14", time: "09:45", tz: "Europe/Ljubljana" }, repeat: { skip: ["2026-10-20"], every: "day" as const } };
    expect(same_timing(job, { at: { date: "2026-10-14", time: "09:45", tz: "UTC" }, repeat: { every: "day", skip: ["2026-10-20"] } })).toBe(true);
    expect(same_timing(job, { at: { date: "2026-10-14", time: "09:45", tz: "UTC" }, repeat: { every: "day" } })).toBe(false);
    expect(same_timing(job, { at: { date: "2026-10-14", time: "09:40", tz: "UTC" }, repeat: job.repeat })).toBe(false);
  });

  it("finds the soonest reminder ahead", () => {
    const job = (id: string, date: string): Job => ({ id, app: "calendar", title: id, at: { date, time: "09:00", tz: "UTC" }, armed: true, kind: "reminder" });
    const now = Date.parse("2026-10-14T10:00:00Z");
    const found = next_reminder([job("past", "2026-10-14"), job("later", "2026-10-20"), job("soon", "2026-10-15")], now);
    expect(found).toEqual({ job: expect.objectContaining({ id: "soon" }), at: Date.parse("2026-10-15T09:00:00Z") });
    expect(next_reminder([], now)).toBeNull();
  });

  it("tells the editor and the shell when a reminder can't follow the repeat", () => {
    const draft = { ...new_draft("2026-01-31"), title: "Rent", repeat: Repeat.MONTHLY, reminder: "1440" } as const;
    expect(reminder_error(draft)).toMatch(/monthly/);
    expect(reminder_error({ ...draft, reminder: "60" })).toBeNull();
    expect(reminder_error({ ...draft, day: "" })).toBeNull();
    expect(() => event_from_args({ title: ["Rent"], day: "2026-01-31", repeat: "monthly", remind: "1d" }, "2026-01-01")).toThrow(/cal add: this reminder/);
  });
});
