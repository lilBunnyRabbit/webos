import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  add_days,
  add_months,
  at,
  draft_error,
  event_from_draft,
  EventColor,
  EventsFileSchema,
  expand,
  layout_timed,
  month_grid,
  months_in,
  new_draft,
  occurrences,
  Repeat,
  skip_occurrence,
  step,
  View,
  week_days,
  weekday_from_monday,
  type CalendarEvent,
} from "./calendar";

// A zone with DST, so the day arithmetic is tested across a 23 h day.
beforeAll(() => {
  vi.stubEnv("TZ", "Europe/Ljubljana");
});
afterAll(() => {
  vi.unstubAllEnvs();
});

function event(patch: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: "e1",
    title: "Standup",
    day: "2026-10-14",
    all_day: false,
    start: "09:00",
    end: "09:15",
    repeat: null,
    skip: [],
    notes: "",
    color: EventColor.PRIMARY,
    reminder: null,
    ...patch,
  };
}

describe("days", () => {
  it("steps across DST and month ends by calendar day", () => {
    expect(add_days("2026-03-28", 1)).toBe("2026-03-29");
    expect(add_days("2026-03-29", 1)).toBe("2026-03-30");
    expect(add_days("2026-10-24", 2)).toBe("2026-10-26");
    expect(add_days("2024-02-28", 1)).toBe("2024-02-29");
    expect(add_days("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("counts weekdays from Monday", () => {
    expect(weekday_from_monday("2026-10-12")).toBe(0);
    expect(weekday_from_monday("2026-10-18")).toBe(6);
    expect(weekday_from_monday("1969-12-31")).toBe(2);
  });

  it("adds months over year ends", () => {
    expect(add_months("2026-12", 1)).toBe("2027-01");
    expect(add_months("2026-01", -1)).toBe("2025-12");
    expect(months_in("2026-11-30", "2027-01-03")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });

  it("builds whole weeks for a month", () => {
    const weeks = month_grid("2026-10");
    expect(weeks[0][0]).toBe("2026-09-28");
    expect(weeks.at(-1)!.at(-1)).toBe("2026-11-01");
    expect(weeks).toHaveLength(5);
    expect(month_grid("2021-02")).toHaveLength(4);
    expect(month_grid("2026-03")).toHaveLength(6);
  });

  it("keeps wall-clock times across DST", () => {
    const before = at("2026-03-28", "07:00");
    const after = at("2026-03-29", "07:00");
    expect(after - before).toBe(23 * 3_600_000);
    expect(new Date(after).getHours()).toBe(7);
    expect(at("2026-10-14", "24:00")).toBe(at("2026-10-15", "00:00"));
  });
});

describe("occurrences", () => {
  it("gives a one-off event once, inside the range only", () => {
    expect(occurrences(event(), "2026-10-01", "2026-10-31")).toEqual(["2026-10-14"]);
    expect(occurrences(event(), "2026-10-15", "2026-10-31")).toEqual([]);
  });

  it("repeats daily from the first day up to `until`", () => {
    const daily = event({ repeat: { every: Repeat.DAILY, until: "2026-10-17" } });
    expect(occurrences(daily, "2026-10-01", "2026-10-31")).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
  });

  it("repeats daily through the DST change at the same local time", () => {
    const daily = event({ day: "2026-03-27", start: "07:00", end: "08:00", repeat: { every: Repeat.DAILY, until: null } });
    const found = expand([daily], "2026-03-27", "2026-03-31");
    expect(found.map((entry) => new Date(entry.start).getHours())).toEqual([7, 7, 7, 7, 7]);
    expect(found.map((entry) => entry.day)).toEqual(["2026-03-27", "2026-03-28", "2026-03-29", "2026-03-30", "2026-03-31"]);
  });

  it("repeats weekly on the same weekday, aligned to the first day", () => {
    const weekly = event({ repeat: { every: Repeat.WEEKLY, until: null } });
    expect(occurrences(weekly, "2026-10-16", "2026-11-05")).toEqual(["2026-10-21", "2026-10-28", "2026-11-04"]);
    expect(occurrences(weekly, "2026-10-21", "2026-10-21")).toEqual(["2026-10-21"]);
  });

  it("clamps monthly repeats on the 31st to shorter months", () => {
    const monthly = event({ day: "2026-01-31", repeat: { every: Repeat.MONTHLY, until: null } });
    expect(occurrences(monthly, "2026-01-01", "2026-06-30")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
    const leap = event({ day: "2028-01-30", repeat: { every: Repeat.MONTHLY, until: null } });
    expect(occurrences(leap, "2028-02-01", "2028-03-31")).toEqual(["2028-02-29", "2028-03-30"]);
  });

  it("puts a yearly Feb 29 on Feb 28 in common years", () => {
    const yearly = event({ day: "2024-02-29", all_day: true, repeat: { every: Repeat.YEARLY, until: null } });
    expect(occurrences(yearly, "2024-01-01", "2028-12-31")).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("never gives a day before the first one", () => {
    const monthly = event({ day: "2026-10-31", repeat: { every: Repeat.MONTHLY, until: null } });
    expect(occurrences(monthly, "2026-10-01", "2026-10-30")).toEqual([]);
  });

  it("leaves out skipped days", () => {
    const daily = skip_occurrence(event({ repeat: { every: Repeat.DAILY, until: null } }), "2026-10-15");
    expect(occurrences(daily, "2026-10-14", "2026-10-16")).toEqual(["2026-10-14", "2026-10-16"]);
  });

  it("sorts all-day events first, then by start", () => {
    const list = expand(
      [event({ id: "late", start: "15:00", end: "16:00" }), event({ id: "all", all_day: true }), event({ id: "early", start: "08:00", end: "08:30" })],
      "2026-10-14",
      "2026-10-14"
    );
    expect(list.map((entry) => entry.event.id)).toEqual(["all", "early", "late"]);
  });
});

describe("layout", () => {
  it("puts overlapping items side by side and lone ones full width", () => {
    const placed = layout_timed([
      { start: 540, end: 600 },
      { start: 570, end: 630 },
      { start: 615, end: 660 },
      { start: 700, end: 720 },
    ]);
    expect(placed.map(({ column, columns }) => [column, columns])).toEqual([
      [0, 2],
      [1, 2],
      [0, 2],
      [0, 1],
    ]);
  });
});

describe("drafts", () => {
  it("validates", () => {
    const draft = { ...new_draft("2026-10-14"), title: "Dentist", start: "10:00", end: "09:00" };
    expect(draft_error({ ...draft, title: " " })).toBe("Give the event a title");
    expect(draft_error(draft)).toBe("The end must be after the start");
    expect(draft_error({ ...draft, all_day: true })).toBeNull();
    expect(draft_error({ ...draft, end: "24:00", repeat: Repeat.WEEKLY, until: "2026-10-01" })).toBe("The repeat must end after the first day");
  });

  it("builds a valid event and keeps skips only for the same series", () => {
    const draft = { ...new_draft("2026-10-14"), title: " Gym ", start: "18:00", end: "19:00", repeat: Repeat.WEEKLY, reminder: "30" } as const;
    const created = event_from_draft(draft, null);
    expect(EventsFileSchema.safeParse({ version: 1, events: [created] }).success).toBe(true);
    expect(created).toMatchObject({ title: "Gym", reminder: 30, repeat: { every: "weekly", until: null } });
    const skipped = skip_occurrence(created, "2026-10-21");
    expect(event_from_draft({ ...draft, title: "Gym!" }, skipped).skip).toEqual(["2026-10-21"]);
    expect(event_from_draft({ ...draft, day: "2026-10-15" }, skipped).skip).toEqual([]);
  });
});

describe("navigation", () => {
  it("steps months keeping the day where it fits", () => {
    expect(step(View.MONTH, "2026-01-31", 1)).toBe("2026-02-28");
    expect(step(View.WEEK, "2026-10-14", -1)).toBe("2026-10-07");
    expect(step(View.WEEK, "2026-10-14", 1, 3)).toBe("2026-10-17");
  });

  it("shows Monday to Sunday, or a few days from the anchor", () => {
    expect(week_days("2026-10-14", 7)[0]).toBe("2026-10-12");
    expect(week_days("2026-10-14", 3)).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
  });
});
