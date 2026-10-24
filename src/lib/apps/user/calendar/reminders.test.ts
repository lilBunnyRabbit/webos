import { describe, expect, it } from "vitest";
import type { Job } from "$lib/core/api/services/scheduler";
import { next_occurrence } from "$lib/core/api/services/scheduler/occurrence";
import { wall_to_epoch } from "$lib/core/utils/zoned";
import { add_days, EventColor, occurrences, Repeat, type CalendarEvent } from "./calendar";
import { event_from_args } from "./parse";
import { event_id_of, event_repeat, lead_days, next_reminder, reminder_input, reminder_job_id, same_timing } from "./reminders";

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

const monthly = { every: Repeat.MONTHLY, until: null };
const yearly = { every: Repeat.YEARLY, until: null };

describe("event_repeat", () => {
  it("is the event's own rule, until and skipped days as they are", () => {
    expect(event_repeat(event())).toBeUndefined();
    expect(event_repeat(event({ repeat: { every: Repeat.DAILY, until: "2026-10-20" }, skip: ["2026-10-16"] }))).toEqual({
      every: "day",
      until: "2026-10-20",
      skip: ["2026-10-16"],
    });
    expect(event_repeat(event({ repeat: { every: Repeat.WEEKLY, until: null } }))).toEqual({ every: "week", days: [3] });
    expect(event_repeat(event({ day: "2026-01-31", repeat: monthly }))).toEqual({ every: "month", day: 31 });
    expect(event_repeat(event({ day: "2028-02-29", repeat: yearly }))).toEqual({ every: "year" });
  });

  it("counts the days from a reminder to its event, an all-day one from 09:00", () => {
    expect(lead_days(event())).toBe(0);
    expect(lead_days(event({ start: "00:30", reminder: 60 }))).toBe(1);
    expect(lead_days(event({ reminder: 1440 }))).toBe(1);
    expect(lead_days(event({ reminder: 10080 }))).toBe(7);
    expect(lead_days(event({ all_day: true, reminder: 540 }))).toBe(0);
    expect(lead_days(event({ all_day: true, reminder: 600 }))).toBe(1);
  });
});

// Every reminder must fire exactly at Calendar's own reminder times: each occurrence's start (09:00 all day) minus the
// minutes. In UTC wall time and elapsed time agree, so this is the old in-app reminder rule exactly, month ends and
// 29 February included.
describe("against Calendar's occurrences", () => {
  const days = ["2024-01-01", "2024-01-05", "2024-01-29", "2024-01-31", "2024-02-29", "2024-03-01", "2024-03-07", "2025-02-28", "2025-03-01", "2026-04-30", "2026-05-31", "2026-08-15", "2027-03-01", "2027-12-31"];
  const minutes = [0, 15, 60, 1440, 2880, 10080];
  const repeats = [null, { every: Repeat.DAILY, until: null }, { every: Repeat.WEEKLY, until: null }, monthly, yearly];
  const SPAN: Record<string, number> = { [Repeat.DAILY]: 160, [Repeat.WEEKLY]: 500, [Repeat.MONTHLY]: 900, [Repeat.YEARLY]: 1500 };

  it("fires on every occurrence and nothing else, until and skips included", () => {
    let checked = 0;
    for (const day of days)
      for (const reminder of minutes)
        for (const repeat of repeats)
          for (const [all_day, start] of [[false, "00:10"], [false, "13:45"], [true, "09:00"]] as const) {
            const span = repeat ? SPAN[repeat.every] : 0;
            const until = repeat ? add_days(day, span - 100) : null;
            const subject = event({ day, reminder, all_day, start, repeat: repeat && { ...repeat, until }, skip: repeat ? [add_days(day, 0), add_days(day, Math.floor(span / 2))] : [] });
            const input = reminder_input(subject, "UTC", -Infinity);
            const base = all_day ? "09:00" : start;
            const expected = occurrences(subject, day, add_days(day, span || 900)).map((on) => Date.parse(`${on}T${base}:00Z`) - reminder * 60_000);
            const fired: number[] = [];
            if (input) {
              const job = { ...input, armed: true };
              for (let after = -Infinity, next = next_occurrence(job, after); next !== null && fired.length <= expected.length; after = next, next = next_occurrence(job, after)) fired.push(next);
            }
            expect(fired, `${day} ${start} ${all_day} ${reminder} ${repeat?.every}`).toEqual(expected);
            checked++;
          }
    expect(checked).toBe(days.length * minutes.length * repeats.length * 3);
  });
});

describe("reminder_input", () => {
  const zone = "Europe/Ljubljana";
  const now = wall_to_epoch({ year: 2026, month: 10, day: 14 }, { hours: 12, minutes: 0 }, zone);

  it("is the event itself with the reminder as its lead time, opening Calendar on the event's day", () => {
    expect(reminder_input(event({ day: "2026-10-15" }), zone, now)).toEqual({
      key: "reminder-e1",
      title: "Standup",
      message: "10:00–11:00 · in 15 min",
      at: { date: "2026-10-15", time: "10:00", tz: zone },
      before: 15,
      kind: "reminder",
      open: { app: "calendar", props: { day: "2026-10-15" } },
    });
    expect(reminder_input(event({ all_day: true, reminder: 1440, day: "2026-10-16" }), zone, now)).toMatchObject({
      at: { date: "2026-10-16", time: "09:00" },
      before: 1440,
      message: "All day · tomorrow",
    });
    const at_start = reminder_input(event({ reminder: 0, day: "2026-10-16" }), zone, now);
    expect(at_start?.message).toBe("10:00–11:00 · now");
    expect(at_start).not.toHaveProperty("before");
  });

  it("opens the day of the first occurrence still ahead", () => {
    const daily = event({ day: "2026-10-01", reminder: 1440, repeat: { every: Repeat.DAILY, until: null }, skip: ["2026-10-16"] });
    expect(reminder_input(daily, zone, now)?.open?.props).toEqual({ day: "2026-10-17" });
  });

  it("follows a monthly event on the 31st a day ahead, whatever the month", () => {
    const input = reminder_input(event({ day: "2026-10-31", reminder: 1440, repeat: monthly }), zone, now)!;
    expect(input).toMatchObject({ at: { date: "2026-10-31", time: "10:00" }, repeat: { every: "month", day: 31 }, before: 1440, open: { props: { day: "2026-10-31" } } });
    const job = { ...input, armed: true };
    const october = next_occurrence(job, now)!;
    const november = next_occurrence(job, october)!;
    const february = [0, 1, 2].reduce((after) => next_occurrence(job, after)!, november);
    expect(october).toBe(wall_to_epoch({ year: 2026, month: 10, day: 30 }, { hours: 10, minutes: 0 }, zone));
    expect(november).toBe(wall_to_epoch({ year: 2026, month: 11, day: 29 }, { hours: 10, minutes: 0 }, zone));
    expect(february).toBe(wall_to_epoch({ year: 2027, month: 2, day: 27 }, { hours: 10, minutes: 0 }, zone));
  });

  it("is null when no reminder is left", () => {
    expect(reminder_input(event({ day: "2026-10-14", start: "12:10", reminder: 15 }), zone, now)).toBeNull();
    expect(reminder_input(event({ day: "2026-10-01", repeat: { every: Repeat.DAILY, until: "2026-10-13" } }), zone, now)).toBeNull();
    expect(reminder_input(event({ reminder: null, day: "2026-10-20" }), zone, now)).toBeNull();
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
    const job = { at: { date: "2026-10-14", time: "10:00", tz: "Europe/Ljubljana" }, repeat: { skip: ["2026-10-20"], every: "day" as const }, before: 15 };
    expect(same_timing(job, { at: { date: "2026-10-14", time: "10:00", tz: "UTC" }, repeat: { every: "day", skip: ["2026-10-20"] }, before: 15 })).toBe(true);
    expect(same_timing(job, { at: { date: "2026-10-14", time: "10:00", tz: "UTC" }, repeat: { every: "day" }, before: 15 })).toBe(false);
    expect(same_timing(job, { at: { date: "2026-10-14", time: "10:00", tz: "UTC" }, repeat: job.repeat, before: 30 })).toBe(false);
    expect(same_timing({ ...job, before: undefined }, { at: job.at, repeat: job.repeat })).toBe(true);
  });

  it("never matches a reminder scheduled at its own time with the rule shifted", () => {
    const old = { at: { date: "2026-10-13", time: "10:00", tz: "UTC" }, repeat: { every: "week" as const, days: [2] } };
    const input = reminder_input(event({ reminder: 1440, repeat: { every: Repeat.WEEKLY, until: null } }), "UTC", -Infinity)!;
    expect(same_timing(old, input)).toBe(false);
  });

  it("finds the soonest reminder ahead", () => {
    const job = (id: string, date: string): Job => ({ id, app: "calendar", title: id, at: { date, time: "09:00", tz: "UTC" }, armed: true, kind: "reminder" });
    const now = Date.parse("2026-10-14T10:00:00Z");
    const found = next_reminder([job("past", "2026-10-14"), job("later", "2026-10-20"), job("soon", "2026-10-15")], now);
    expect(found).toEqual({ job: expect.objectContaining({ id: "soon" }), at: Date.parse("2026-10-15T09:00:00Z") });
    expect(next_reminder([], now)).toBeNull();
  });

  it("lets the shell add a reminder a day ahead of a monthly 31st", () => {
    expect(event_from_args({ title: ["Rent"], day: "2026-01-31", repeat: "monthly", remind: "1d" }, "2026-01-01")).toMatchObject({ day: "2026-01-31", reminder: 1440 });
  });
});
