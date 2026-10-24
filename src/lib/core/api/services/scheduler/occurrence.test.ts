import { describe, expect, it } from "vitest";
import { format_repeat, MISSED_AFTER, next_due, next_occurrence, pending, plan } from "./occurrence";
import type { Job, JobRepeat } from "./type";

const NY = "America/New_York";
const LJ = "Europe/Ljubljana";
const MINUTE = 60_000;
const utc = (text: string) => Date.parse(text);

function job(overrides: Partial<Job> = {}): Job {
  return { id: "clock:a", app: "clock", title: "Alarm", at: { date: "2026-10-21", time: "07:00", tz: LJ }, armed: true, kind: "alarm", ...overrides };
}

function series(repeat: JobRepeat, at: Job["at"], after: number, count: number): (number | null)[] {
  const rule = job({ at, repeat });
  const out: (number | null)[] = [];
  let cursor = after;
  for (let index = 0; index < count; index++) {
    const next = next_occurrence(rule, cursor);
    out.push(next);
    if (next === null) break;
    cursor = next;
  }
  return out;
}

const iso = (values: (number | null)[]) => values.map((value) => (value === null ? null : new Date(value).toISOString()));

describe("next_occurrence: one-shots", () => {
  it("fires an epoch once, strictly after `after`", () => {
    const at = { epoch: utc("2026-10-21T10:00:00Z") };
    expect(next_occurrence(job({ at }), utc("2026-10-21T09:00:00Z"))).toBe(at.epoch);
    expect(next_occurrence(job({ at }), at.epoch)).toBeNull();
    expect(next_occurrence(job({ at }), -Infinity)).toBe(at.epoch);
  });

  it("fires a wall time in its own zone, not the device's", () => {
    expect(next_occurrence(job(), -Infinity)).toBe(utc("2026-10-21T05:00:00Z"));
    expect(next_occurrence(job({ at: { date: "2026-10-21", time: "07:00", tz: "Asia/Tokyo" } }), -Infinity)).toBe(utc("2026-10-20T22:00:00Z"));
  });

  it("shifts a one-shot in a DST gap forward", () => {
    expect(next_occurrence(job({ at: { date: "2026-03-08", time: "02:30", tz: NY } }), -Infinity)).toBe(utc("2026-03-08T07:30:00Z"));
  });

  it("never fires disarmed", () => {
    expect(next_occurrence(job({ armed: false }), -Infinity)).toBeNull();
    expect(next_occurrence(job({ armed: false, repeat: { every: "day" } }), -Infinity)).toBeNull();
    expect(next_occurrence(job({ armed: false, snooze_until: utc("2026-10-21T08:00:00Z") }), -Infinity)).toBeNull();
  });
});

describe("next_occurrence: day", () => {
  it("steps calendar days, so the wall time holds across DST", () => {
    const at = { date: "2026-10-23", time: "07:00", tz: LJ };
    expect(iso(series({ every: "day" }, at, utc("2026-10-23T00:00:00Z"), 4))).toEqual([
      "2026-10-23T05:00:00.000Z",
      "2026-10-24T05:00:00.000Z",
      "2026-10-25T06:00:00.000Z",
      "2026-10-26T06:00:00.000Z",
    ]);
  });

  it("keeps the interval aligned to the first day", () => {
    const at = { date: "2026-10-01", time: "09:00", tz: "UTC" };
    expect(iso(series({ every: "day", interval: 3 }, at, utc("2026-10-05T12:00:00Z"), 3))).toEqual([
      "2026-10-07T09:00:00.000Z",
      "2026-10-10T09:00:00.000Z",
      "2026-10-13T09:00:00.000Z",
    ]);
  });

  it("starts on its first day when that's ahead", () => {
    const at = { date: "2026-12-01", time: "09:00", tz: "UTC" };
    expect(next_occurrence(job({ at, repeat: { every: "day" } }), utc("2026-10-21T12:00:00Z"))).toBe(utc("2026-12-01T09:00:00Z"));
  });

  it("fires a time a spring-forward skips at the shifted time, that day only", () => {
    const at = { date: "2026-03-07", time: "02:30", tz: NY };
    expect(iso(series({ every: "day" }, at, -Infinity, 3))).toEqual([
      "2026-03-07T07:30:00.000Z",
      "2026-03-08T07:30:00.000Z",
      "2026-03-09T06:30:00.000Z",
    ]);
  });

  it("fires a time a fall-back repeats once, at its first pass", () => {
    const at = { date: "2026-10-31", time: "01:30", tz: NY };
    expect(iso(series({ every: "day" }, at, -Infinity, 3))).toEqual([
      "2026-10-31T05:30:00.000Z",
      "2026-11-01T05:30:00.000Z",
      "2026-11-02T06:30:00.000Z",
    ]);
    expect(next_occurrence(job({ at, repeat: { every: "day" } }), utc("2026-11-01T06:00:00Z"))).toBe(utc("2026-11-02T06:30:00Z"));
  });
});

describe("next_occurrence: week", () => {
  it("fires on the listed weekdays, in any order", () => {
    const at = { date: "2026-10-19", time: "08:00", tz: "UTC" };
    expect(iso(series({ every: "week", days: [5, 1, 3] }, at, utc("2026-10-21T09:00:00Z"), 4))).toEqual([
      "2026-10-23T08:00:00.000Z",
      "2026-10-26T08:00:00.000Z",
      "2026-10-28T08:00:00.000Z",
      "2026-10-30T08:00:00.000Z",
    ]);
  });

  it("waits for its first day even when it's a listed weekday before it", () => {
    const at = { date: "2026-10-22", time: "08:00", tz: "UTC" };
    expect(next_occurrence(job({ at, repeat: { every: "week", days: [3] } }), -Infinity)).toBe(utc("2026-10-28T08:00:00Z"));
  });

  it("fires a weekday the zone skipped on the next day, even when asked from that next day", () => {
    // Samoa skipped Friday 2011-12-30: the Friday 09:00 occurrence lands on Saturday 09:00.
    const at = { date: "2011-12-01", time: "09:00", tz: "Pacific/Apia" };
    const saturday_morning = Date.parse("2011-12-30T18:00:00Z");
    expect(next_occurrence(job({ at, repeat: { every: "week", days: [5] } }), saturday_morning)).toBe(Date.parse("2011-12-30T19:00:00Z"));
  });

  it("never fires with no days", () => {
    expect(next_occurrence(job({ repeat: { every: "week", days: [] } }), -Infinity)).toBeNull();
  });
});

describe("next_occurrence: month", () => {
  it("clamps 31 to each month's last day", () => {
    const at = { date: "2026-01-31", time: "12:00", tz: "UTC" };
    expect(iso(series({ every: "month", day: 31 }, at, -Infinity, 5))).toEqual([
      "2026-01-31T12:00:00.000Z",
      "2026-02-28T12:00:00.000Z",
      "2026-03-31T12:00:00.000Z",
      "2026-04-30T12:00:00.000Z",
      "2026-05-31T12:00:00.000Z",
    ]);
  });

  it("clamps to 29 February in a leap year", () => {
    const at = { date: "2028-01-30", time: "12:00", tz: "UTC" };
    expect(iso(series({ every: "month", day: 30 }, at, -Infinity, 2))).toEqual(["2028-01-30T12:00:00.000Z", "2028-02-29T12:00:00.000Z"]);
  });

  it("skips this month's day when the first day is past it", () => {
    const at = { date: "2026-10-20", time: "12:00", tz: "UTC" };
    expect(next_occurrence(job({ at, repeat: { every: "month", day: 15 } }), -Infinity)).toBe(utc("2026-11-15T12:00:00Z"));
  });
});

describe("next_occurrence: year", () => {
  it("fires 29 February on the 28th in other years", () => {
    const at = { date: "2028-02-29", time: "10:00", tz: "UTC" };
    expect(iso(series({ every: "year" }, at, -Infinity, 5))).toEqual([
      "2028-02-29T10:00:00.000Z",
      "2029-02-28T10:00:00.000Z",
      "2030-02-28T10:00:00.000Z",
      "2031-02-28T10:00:00.000Z",
      "2032-02-29T10:00:00.000Z",
    ]);
  });

  it("finds the next year's occurrence from any point in the year", () => {
    const at = { date: "1990-06-15", time: "09:00", tz: LJ };
    expect(next_occurrence(job({ at, repeat: { every: "year" } }), utc("2026-10-21T00:00:00Z"))).toBe(utc("2027-06-15T07:00:00Z"));
  });
});

describe("next_occurrence: until and skip", () => {
  it("fires on its last day, then never", () => {
    const at = { date: "2026-10-21", time: "09:00", tz: "UTC" };
    expect(iso(series({ every: "day", until: "2026-10-23" }, at, -Infinity, 4))).toEqual([
      "2026-10-21T09:00:00.000Z",
      "2026-10-22T09:00:00.000Z",
      "2026-10-23T09:00:00.000Z",
      null,
    ]);
  });

  it("reads until as a day in the job's zone", () => {
    const at = { date: "2026-10-21", time: "23:30", tz: "Pacific/Auckland" };
    const rule = job({ at, repeat: { every: "day", until: "2026-10-21" } });
    expect(next_occurrence(rule, -Infinity)).toBe(utc("2026-10-21T10:30:00Z"));
    expect(next_occurrence(rule, utc("2026-10-21T10:30:00Z"))).toBeNull();
  });

  it("skips listed days, the clamped one included", () => {
    const at = { date: "2026-01-31", time: "12:00", tz: "UTC" };
    expect(iso(series({ every: "month", day: 31, skip: ["2026-02-28", "2026-03-31"] }, at, utc("2026-02-01T00:00:00Z"), 1))).toEqual([
      "2026-04-30T12:00:00.000Z",
    ]);
  });

  it("gives up on a rule that can't fire again", () => {
    const at = { date: "2026-10-21", time: "09:00", tz: "UTC" };
    expect(next_occurrence(job({ at, repeat: { every: "day", until: "2026-10-01" } }), -Infinity)).toBeNull();
    const skip = Array.from({ length: 7 }, (_, index) => `2026-10-${String(26 + index).padStart(2, "0")}`.replace("2026-10-32", "2026-11-01"));
    expect(next_occurrence(job({ at, repeat: { every: "week", days: [1], skip, until: "2026-11-01" } }), utc("2026-10-22T00:00:00Z"))).toBeNull();
  });
});

describe("next_occurrence: snooze", () => {
  const at = { date: "2026-10-21", time: "07:00", tz: "UTC" };

  it("fires the snooze ahead of the rule", () => {
    const snoozed = job({ at, repeat: { every: "day" }, snooze_until: utc("2026-10-21T07:10:00Z") });
    expect(next_occurrence(snoozed, utc("2026-10-21T07:00:00Z"))).toBe(utc("2026-10-21T07:10:00Z"));
  });

  it("lets an earlier rule occurrence go first", () => {
    const snoozed = job({ at, repeat: { every: "day" }, snooze_until: utc("2026-10-22T09:00:00Z") });
    expect(next_occurrence(snoozed, utc("2026-10-21T08:00:00Z"))).toBe(utc("2026-10-22T07:00:00Z"));
  });

  it("revives a fired one-shot until the snooze is done", () => {
    const snoozed = job({ at, snooze_until: utc("2026-10-21T07:10:00Z") });
    expect(next_occurrence(snoozed, utc("2026-10-21T07:00:00Z"))).toBe(utc("2026-10-21T07:10:00Z"));
    expect(next_occurrence(snoozed, utc("2026-10-21T07:10:00Z"))).toBeNull();
  });
});

describe("next_occurrence: before", () => {
  const DAY = 1440;
  const WEEK = 7 * DAY;
  const lead = (repeat: JobRepeat | undefined, at: Job["at"], before: number, after: number, count: number) => {
    const rule = job({ at, repeat, before });
    const out: (number | null)[] = [];
    for (let cursor = after; out.length < count; ) {
      const next = next_occurrence(rule, cursor);
      out.push(next);
      if (next === null) break;
      cursor = next;
    }
    return iso(out);
  };

  it("takes an epoch's minutes off plainly", () => {
    expect(next_occurrence(job({ at: { epoch: utc("2026-10-21T10:00:00Z") }, before: 15 }), -Infinity)).toBe(utc("2026-10-21T09:45:00Z"));
  });

  it("fires a day ahead of a monthly 31st, whatever the month's length", () => {
    expect(lead({ every: "month", day: 31 }, { date: "2026-01-31", time: "09:00", tz: "UTC" }, DAY, -Infinity, 5)).toEqual([
      "2026-01-30T09:00:00.000Z",
      "2026-02-27T09:00:00.000Z",
      "2026-03-30T09:00:00.000Z",
      "2026-04-29T09:00:00.000Z",
      "2026-05-30T09:00:00.000Z",
    ]);
  });

  it("fires a week ahead of the 1st to the 7th in the previous month", () => {
    expect(lead({ every: "month", day: 1 }, { date: "2026-01-01", time: "09:00", tz: "UTC" }, WEEK, -Infinity, 3)).toEqual([
      "2025-12-25T09:00:00.000Z",
      "2026-01-25T09:00:00.000Z",
      "2026-02-22T09:00:00.000Z",
    ]);
    expect(lead({ every: "month", day: 5 }, { date: "2028-01-05", time: "09:00", tz: "UTC" }, WEEK, utc("2028-01-01T00:00:00Z"), 3)).toEqual([
      "2028-01-29T09:00:00.000Z",
      "2028-02-27T09:00:00.000Z",
      "2028-03-29T09:00:00.000Z",
    ]);
  });

  it("fires a day ahead of 29 February, the 28th clamped in other years", () => {
    expect(lead({ every: "year" }, { date: "2028-02-29", time: "09:00", tz: "UTC" }, DAY, -Infinity, 5)).toEqual([
      "2028-02-28T09:00:00.000Z",
      "2029-02-27T09:00:00.000Z",
      "2030-02-27T09:00:00.000Z",
      "2031-02-27T09:00:00.000Z",
      "2032-02-28T09:00:00.000Z",
    ]);
  });

  it("fires a day ahead of 1 March from a non-leap year, on 29 February in a leap one", () => {
    expect(lead({ every: "year" }, { date: "2027-03-01", time: "09:00", tz: "UTC" }, DAY, -Infinity, 3)).toEqual([
      "2027-02-28T09:00:00.000Z",
      "2028-02-29T09:00:00.000Z",
      "2029-02-28T09:00:00.000Z",
    ]);
  });

  it("takes the minutes off the wall clock across spring-forward", () => {
    // Ljubljana skips 02:00–03:00 on 29 March 2026.
    expect(next_occurrence(job({ at: { date: "2026-03-29", time: "09:00", tz: LJ }, before: DAY }), -Infinity)).toBe(utc("2026-03-28T08:00:00Z"));
    expect(next_occurrence(job({ at: { date: "2026-03-30", time: "09:00", tz: LJ }, before: DAY }), -Infinity)).toBe(utc("2026-03-29T07:00:00Z"));
    expect(lead({ every: "day" }, { date: "2026-03-28", time: "03:30", tz: LJ }, 60, -Infinity, 3)).toEqual([
      "2026-03-28T01:30:00.000Z",
      // 02:30 doesn't exist that night: it fires shifted forward by the gap, at the event's own 03:30.
      "2026-03-29T01:30:00.000Z",
      "2026-03-30T00:30:00.000Z",
    ]);
  });

  it("takes the minutes off the wall clock across fall-back", () => {
    // Ljubljana runs 02:00–03:00 twice on 25 October 2026.
    const event = utc("2026-10-25T08:00:00Z");
    const reminder = next_occurrence(job({ at: { date: "2026-10-25", time: "09:00", tz: LJ }, before: DAY }), -Infinity)!;
    expect(reminder).toBe(utc("2026-10-24T07:00:00Z"));
    expect(event - reminder).toBe(25 * 3_600_000);
    expect(lead({ every: "day" }, { date: "2026-10-24", time: "03:30", tz: LJ }, 60, -Infinity, 3)).toEqual([
      "2026-10-24T00:30:00.000Z",
      // 02:30 happens twice: the first pass, two hours before the event's 03:30.
      "2026-10-25T00:30:00.000Z",
      "2026-10-26T01:30:00.000Z",
    ]);
  });

  it("reads until and skip as the rule's own days, not the fire's", () => {
    const at = { date: "2026-10-20", time: "09:00", tz: "UTC" };
    expect(lead({ every: "day", until: "2026-10-23", skip: ["2026-10-22"] }, at, DAY, -Infinity, 4)).toEqual([
      "2026-10-19T09:00:00.000Z",
      "2026-10-20T09:00:00.000Z",
      "2026-10-22T09:00:00.000Z",
      null,
    ]);
  });

  it("counts armed_at, last_fired and missed_at as fire instants", () => {
    const at = { date: "2026-10-20", time: "09:00", tz: "UTC" };
    const armed_at = utc("2026-10-21T10:00:00Z");
    const daily = job({ at, repeat: { every: "day" }, before: DAY, armed_at });
    // The 22nd's reminder fired at 09:00 on the 21st, before it was armed: neither fired nor missed.
    expect(pending(daily)).toBe(utc("2026-10-22T09:00:00Z"));
    expect(plan([daily], armed_at).changed).toBe(false);
    const fired = plan([daily], utc("2026-10-22T09:00:30Z"));
    expect(fired.fired.map((entry) => entry.due)).toEqual([utc("2026-10-22T09:00:00Z")]);
    expect(fired.jobs[0].last_fired).toBe(utc("2026-10-22T09:00:00Z"));
    expect(pending(fired.jobs[0])).toBe(utc("2026-10-23T09:00:00Z"));
  });
});

describe("plan", () => {
  const now = utc("2026-10-21T05:01:00Z");

  it("fires what's due, disarms a one-shot and records the occurrence", () => {
    const result = plan([job()], now);
    expect(result.fired.map((fired) => fired.due)).toEqual([utc("2026-10-21T05:00:00Z")]);
    expect(result.missed).toEqual([]);
    expect(result.jobs[0]).toMatchObject({ armed: false, last_fired: utc("2026-10-21T05:00:00Z") });
    expect(pending(result.jobs[0])).toBeNull();
    expect(result.changed).toBe(true);
  });

  it("fires right up to the grace, and misses past it", () => {
    const due = utc("2026-10-21T05:00:00Z");
    expect(plan([job()], due + MISSED_AFTER).fired).toHaveLength(1);
    const late = plan([job()], due + MISSED_AFTER + 1);
    expect(late.fired).toEqual([]);
    expect(late.missed).toEqual([{ id: "clock:a", app: "clock", title: "Alarm", kind: "alarm", due }]);
    expect(late.jobs[0]).toMatchObject({ armed: false, missed_at: due });
    expect(late.jobs[0].last_fired).toBeUndefined();
  });

  it("leaves future and finished jobs alone", () => {
    const later = job({ id: "clock:b", at: { epoch: now + MINUTE } });
    const done = job({ id: "clock:c", armed: false });
    const result = plan([later, done], now);
    expect(result).toEqual({ jobs: [later, done], changed: false, fired: [], missed: [] });
  });

  it("skips a repeating job missed for days to its next occurrence, reported once", () => {
    const daily = job({ repeat: { every: "day" }, at: { date: "2026-10-01", time: "07:00", tz: LJ }, last_fired: utc("2026-10-15T05:00:00Z") });
    const at_noon = utc("2026-10-21T10:00:00Z");
    const result = plan([daily], at_noon);
    expect(result.fired).toEqual([]);
    expect(result.missed).toHaveLength(1);
    expect(result.missed[0].due).toBe(utc("2026-10-21T05:00:00Z"));
    expect(result.jobs[0]).toMatchObject({ armed: true, missed_at: utc("2026-10-21T05:00:00Z"), last_fired: utc("2026-10-15T05:00:00Z") });
    expect(pending(result.jobs[0])).toBe(utc("2026-10-22T05:00:00Z"));
    expect(plan(result.jobs, at_noon).changed).toBe(false);
  });

  it("fires a repeating job's occurrence inside the grace even when older ones were missed", () => {
    const daily = job({ repeat: { every: "day" }, at: { date: "2026-10-01", time: "07:00", tz: LJ }, last_fired: utc("2026-10-15T05:00:00Z") });
    const result = plan([daily], utc("2026-10-21T05:01:00Z"));
    expect(result.missed).toEqual([]);
    expect(result.fired.map((fired) => fired.due)).toEqual([utc("2026-10-21T05:00:00Z")]);
    expect(pending(result.jobs[0])).toBe(utc("2026-10-22T05:00:00Z"));
  });

  it("clears a snooze when it fires and keeps the rule", () => {
    const snooze = utc("2026-10-21T05:10:00Z");
    const snoozed = job({ repeat: { every: "day" }, last_fired: utc("2026-10-21T05:00:00Z"), snooze_until: snooze });
    const result = plan([snoozed], snooze + 1000);
    expect(result.fired[0].due).toBe(snooze);
    expect(result.jobs[0].snooze_until).toBeUndefined();
    expect(result.jobs[0].armed).toBe(true);
    expect(pending(result.jobs[0])).toBe(utc("2026-10-22T05:00:00Z"));
  });

  it("counts from armed_at, so a rule set up after today's time waits for tomorrow", () => {
    const created = utc("2026-10-21T10:00:00Z");
    const daily = job({ repeat: { every: "day" }, armed_at: created });
    expect(pending(daily)).toBe(utc("2026-10-22T05:00:00Z"));
    expect(plan([daily], created).changed).toBe(false);
  });

  it("counts an occurrence exactly at armed_at, and never a one-shot armed after its time", () => {
    const at = utc("2026-10-21T05:00:00Z");
    expect(pending(job({ armed_at: at }))).toBe(at);
    expect(pending(job({ armed_at: at + 1 }))).toBeNull();
  });

  it("carries a repeating rule on from missed_at", () => {
    const daily = job({ repeat: { every: "day" }, missed_at: utc("2026-10-21T05:00:00Z") });
    expect(pending(daily)).toBe(utc("2026-10-22T05:00:00Z"));
  });
});

describe("next_due", () => {
  it("is the earliest pending occurrence", () => {
    const a = job({ id: "clock:a", at: { epoch: 300 } });
    const b = job({ id: "clock:b", at: { epoch: 200 } });
    expect(next_due([a, b, job({ id: "clock:c", armed: false })])).toBe(200);
    expect(next_due([])).toBeNull();
  });
});

describe("format_repeat", () => {
  it("reads like the rule", () => {
    expect(format_repeat(undefined)).toBe("once");
    expect(format_repeat({ every: "day" })).toBe("daily");
    expect(format_repeat({ every: "day", interval: 2 })).toBe("every 2 days");
    expect(format_repeat({ every: "week", days: [5, 1] })).toBe("Mon, Fri");
    expect(format_repeat({ every: "month", day: 31, until: "2027-01-01" })).toBe("monthly on day 31 until 2027-01-01");
    expect(format_repeat({ every: "year" })).toBe("yearly");
  });

  it("adds the lead time", () => {
    expect(format_repeat({ every: "month", day: 31 }, 1440)).toBe("monthly on day 31, 1 day before");
    expect(format_repeat(undefined, 120)).toBe("once, 2 hours before");
    expect(format_repeat({ every: "day" }, 15)).toBe("daily, 15 min before");
    expect(format_repeat({ every: "day" }, 0)).toBe("daily");
  });
});
