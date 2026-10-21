import { describe, expect, it } from "vitest";
import { pending, type Job, type JobInput } from "$lib/core/api/services/scheduler";
import {
  alarm_input,
  alarm_job_id,
  alarm_of,
  APP_ID,
  clock_alarms,
  clock_timers,
  drop_orphans,
  format_duration,
  format_stopwatch,
  format_until,
  is_snoozed,
  laps_of,
  next_alarm,
  next_wall,
  repeat_label,
  stopwatch_elapsed,
  time_to_run,
  timer_input,
  timer_job_id,
  timer_of,
  timer_remaining,
  timer_state,
  TimerState,
  find_entry,
  parse_days,
  ActiveKind,
  active_items,
  ClockDataSchema,
  ClockTab,
  EMPTY_CLOCK,
  EMPTY_STOPWATCH,
  fit_items,
  landing_tab,
  migrate_stopwatch,
  running_count,
  stopwatch_of,
  widget_slots,
  type Alarm,
  type ClockData,
  type Timer,
} from "./clock";

const ZONE = "Europe/Ljubljana";
const HOUR = 3_600_000;
// 2026-10-14 is a Wednesday; Ljubljana is UTC+2 until 25 October.
const at = (day: number, hours: number, minutes = 0) => Date.UTC(2026, 9, day, hours - 2, minutes);

function job(input: JobInput, patch: Partial<Job> = {}): Job {
  const { key, armed = true, ...rest } = input;
  return { ...rest, id: `${APP_ID}:${key}`, app: APP_ID, armed, ...patch };
}

const clock = (patch: Partial<ClockData> = {}): ClockData => ({ ...structuredClone(EMPTY_CLOCK), ...patch });

describe("alarm jobs", () => {
  it("a one-off alarm is the next time the clock reads it, in the device's zone", () => {
    expect(next_wall("18:30", at(14, 12), ZONE)).toEqual({ date: "2026-10-14", time: "18:30", tz: ZONE });
    expect(next_wall("07:00", at(14, 12), ZONE)).toEqual({ date: "2026-10-15", time: "07:00", tz: ZONE });
    expect(next_wall("12:00", at(14, 12), ZONE)).toEqual({ date: "2026-10-15", time: "12:00", tz: ZONE });

    const input = alarm_input("a1", { time: "07:00", days: [], label: "" }, at(14, 12), ZONE);
    expect(input).toMatchObject({ key: "alarm-a1", title: "Alarm", message: "07:00 · Once", kind: "alarm", at: { date: "2026-10-15", time: "07:00", tz: ZONE } });
    expect(input.repeat).toBeUndefined();
    expect(input.actions).toEqual([
      { label: "Snooze 10 min", command: "alarm snooze a1" },
      { label: "Stop", command: "alarm stop a1" },
    ]);
    expect(input.open).toEqual({ app: APP_ID, props: { tab: ClockTab.ALARMS } });
    expect(pending(job(input, { armed_at: at(14, 12) }))).toBe(at(15, 7));
  });

  it("a weekday alarm repeats every week from today, skipping the weekend", () => {
    const input = alarm_input("w", { time: "07:00", days: [5, 1, 3, 2, 4, 1], label: "Work" }, at(14, 12), ZONE);
    expect(input).toMatchObject({ title: "Work", message: "07:00 · Weekdays", at: { date: "2026-10-14" }, repeat: { every: "week", days: [1, 2, 3, 4, 5] } });

    const fresh = job(input, { armed_at: at(14, 12) });
    expect(pending(fresh)).toBe(at(15, 7));
    expect(pending({ ...fresh, last_fired: at(16, 7) })).toBe(at(19, 7));
    expect(pending(job(input, { armed_at: at(14, 6) }))).toBe(at(14, 7));
  });

  it("reads back as Clock's alarm, with its label from the extras", () => {
    const input = alarm_input("w", { time: "07:00", days: [0, 6], label: "Lie in" }, at(14, 12), ZONE);
    const read = alarm_of(job(input, { armed_at: at(14, 12) }), { label: "Lie in" })!;
    expect(read).toEqual({ id: "w", job: alarm_job_id("w"), time: "07:00", days: [0, 6], label: "Lie in", on: true, snooze_until: null, next: at(17, 7) });
    expect(alarm_of(job(input, { armed: false }), undefined)).toMatchObject({ label: "", on: false, next: null });
    expect(alarm_of(job(timer_input("t", "", 60_000, at(14, 13))), undefined)).toBeNull();
  });

  it("is snoozed while the snooze is what rings next", () => {
    const input = alarm_input("s", { time: "07:00", days: [], label: "" }, at(14, 12), ZONE);
    const fired = job(input, { armed: true, armed_at: at(15, 7, 1), last_fired: at(15, 7), snooze_until: at(15, 7, 11) });
    const alarm = alarm_of(fired, undefined)!;
    expect(alarm.next).toBe(at(15, 7, 11));
    expect(is_snoozed(alarm, at(15, 7, 5))).toBe(true);
    expect(is_snoozed(alarm, at(15, 7, 12))).toBe(false);
    expect(is_snoozed(alarm_of({ ...fired, snooze_until: undefined }, undefined)!, at(15, 7, 5))).toBe(false);
  });

  it("lists by time of day and picks the soonest one that's on", () => {
    const now = at(14, 12);
    const jobs = [
      job(alarm_input("b", { time: "20:00", days: [], label: "" }, now, ZONE), { armed_at: now }),
      job(alarm_input("a", { time: "09:00", days: [], label: "" }, now, ZONE), { armed_at: now }),
      job(alarm_input("c", { time: "13:00", days: [], label: "" }, now, ZONE), { armed: false }),
      { ...job(alarm_input("x", { time: "08:00", days: [], label: "" }, now, ZONE)), id: "calendar:alarm-x", app: "calendar" },
    ];
    const alarms = clock_alarms(jobs, clock({ alarms: { [alarm_job_id("a")]: { label: "Gym" } } }));
    expect(alarms.map((alarm) => [alarm.id, alarm.label])).toEqual([
      ["a", "Gym"],
      ["c", ""],
      ["b", ""],
    ]);
    expect(next_alarm(alarms, now)).toEqual({ alarm: alarms[2], at: at(14, 20) });
    expect(next_alarm([], now)).toBeNull();
  });
});

describe("timer jobs", () => {
  const input = timer_input("t1", "Tea", 180_000, 1_180_000);
  const extras = { label: "Tea", duration_ms: 180_000 };

  it("ends at an instant and rings with Restart and Stop", () => {
    expect(input).toMatchObject({ key: "timer-t1", title: "Tea is done", message: "3 min", kind: "timer", at: { epoch: 1_180_000 } });
    expect(input.actions?.map((action) => action.command)).toEqual(["timer restart t1", "timer stop t1"]);
    expect(timer_input("t2", "", 60_000, 0).title).toBe("Timer is done");
  });

  it("runs while armed, is paused or reset by its extras, and done once it fired", () => {
    const running = timer_of(job(input, { armed_at: 1_000_000 }), extras)!;
    expect(running).toEqual({ id: "t1", job: timer_job_id("t1"), label: "Tea", duration_ms: 180_000, end_at: 1_180_000, remaining_ms: 180_000 });
    expect(timer_state(running)).toBe(TimerState.RUNNING);
    expect(timer_remaining(running, 1_060_000)).toBe(120_000);

    const paused = timer_of(job(input, { armed: false }), { ...extras, left_ms: 120_000 })!;
    expect(timer_state(paused)).toBe(TimerState.PAUSED);
    expect(timer_remaining(paused, 9_999_999)).toBe(120_000);
    expect(time_to_run(paused)).toBe(120_000);

    const reset = timer_of(job(input, { armed: false }), { ...extras, left_ms: 180_000 })!;
    expect(timer_state(reset)).toBe(TimerState.IDLE);

    const done = timer_of(job(input, { armed: false, last_fired: 1_180_000 }), extras)!;
    expect(timer_state(done)).toBe(TimerState.DONE);
    expect(time_to_run(done)).toBe(180_000);
  });

  it("guesses the length of a timer with no extras from when it was armed", () => {
    expect(timer_of(job(input, { armed_at: 1_120_000 }), undefined)).toMatchObject({ label: "", duration_ms: 60_000 });
  });

  it("drops extras whose job is gone", () => {
    const data = clock({ alarms: { "clock:alarm-gone": { label: "x" }, [alarm_job_id("a")]: { label: "y" } }, timers: { [timer_job_id("t1")]: extras, "clock:timer-gone": extras } });
    drop_orphans(data, [job(input), job(alarm_input("a", { time: "07:00", days: [], label: "" }, 0, ZONE))]);
    expect(Object.keys(data.alarms)).toEqual([alarm_job_id("a")]);
    expect(Object.keys(data.timers)).toEqual([timer_job_id("t1")]);
    expect(clock_timers([job(input)], data).map((timer) => timer.label)).toEqual(["Tea"]);
  });
});

describe("labels", () => {
  it("names repeat patterns", () => {
    expect(repeat_label([])).toBe("Once");
    expect(repeat_label([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(repeat_label([5, 1, 2, 3, 4])).toBe("Weekdays");
    expect(repeat_label([6, 0])).toBe("Weekends");
    expect(repeat_label([0, 3, 1])).toBe("Mon, Wed, Sun");
  });

  it("formats time left and durations", () => {
    expect(format_until(20_000)).toBe("in under a minute");
    expect(format_until(3 * 60_000)).toBe("in 3 min");
    expect(format_until(7 * HOUR + 12 * 60_000)).toBe("in 7 h 12 min");
    expect(format_until(26 * HOUR)).toBe("in 1 d 2 h");
    expect(format_duration(25 * 60_000)).toBe("25 min");
    expect(format_duration(90 * 60_000 + 5_000)).toBe("1 h 30 min 5 s");
  });
});

describe("stopwatch", () => {
  it("counts wall-clock time and splits laps", () => {
    const state = { started_at: 10_000, before_ms: 5_000, laps: [3_000, 8_000, 9_500] };
    expect(stopwatch_elapsed(state, 12_000)).toBe(7_000);
    expect(stopwatch_elapsed({ ...state, started_at: null }, 99_999)).toBe(5_000);
    expect(format_stopwatch(61_234)).toBe("01:01.23");
    expect(format_stopwatch(3_723_450)).toBe("1:02:03.45");
    expect(laps_of(state)).toEqual([
      { n: 3, total_ms: 9_500, split_ms: 1_500 },
      { n: 2, total_ms: 8_000, split_ms: 5_000 },
      { n: 1, total_ms: 3_000, split_ms: 3_000 },
    ]);
  });
});

describe("shell parsing", () => {
  it("reads repeat days", () => {
    expect(parse_days("weekdays")).toEqual([1, 2, 3, 4, 5]);
    expect(parse_days("Weekends")).toEqual([0, 6]);
    expect(parse_days("wed,mon,wed")).toEqual([1, 3]);
    expect(parse_days("monday,sun")).toEqual([0, 1]);
    expect(parse_days("once")).toEqual([]);
    expect(parse_days("mon,xyz")).toBeNull();
  });

  it("finds by id prefix or label", () => {
    const entries = [
      { id: "ab12cd34", label: "Tea" },
      { id: "ab99ff00", label: "" },
      { id: "c0ffee00", label: "tea" },
    ];
    expect(find_entry(entries, "c0", "timer")).toBe(entries[2]);
    expect(find_entry(entries, "ab", "timer")).toBe('timer id "ab" is ambiguous');
    expect(find_entry(entries, "TEA", "timer")).toBe('more than one timer is called "TEA"');
    expect(find_entry(entries, "zz", "timer")).toBe('no timer "zz"');
  });
});

describe("the data file", () => {
  it("reads files without a stopwatch, and drops a broken one instead of the file", () => {
    const old = { version: 1, zones: ["Asia/Tokyo"], alarms: {}, timers: {} };
    const parsed = ClockDataSchema.parse(old);
    expect(stopwatch_of(parsed)).toEqual({ started_at: null, before_ms: 0, laps: [] });
    const broken = ClockDataSchema.parse({ ...old, stopwatch: { started_at: "soon" } });
    expect(broken.zones).toEqual(["Asia/Tokyo"]);
    expect(broken.stopwatch).toBeUndefined();
  });

  it("drops alarms and timers from before the scheduler, keeping the rest", () => {
    const before = {
      version: 1,
      zones: ["Asia/Tokyo"],
      alarms: [{ id: "a", time: "07:00", days: [], label: "", enabled: true, armed_at: 0, last_fired: null, snooze_until: null }],
      timers: [{ id: "t", label: "", duration_ms: 1000, end_at: null, remaining_ms: 1000 }],
      stopwatch: { started_at: null, before_ms: 5, laps: [] },
    };
    expect(ClockDataSchema.parse(before)).toEqual({ version: 1, zones: ["Asia/Tokyo"], alarms: {}, timers: {}, stopwatch: before.stopwatch });
  });

  it("migrates the window storage stopwatch once, never over the file's own", () => {
    const stored = { started_at: 5, before_ms: 100, laps: [50] };
    const data = clock();
    expect(migrate_stopwatch(data, stored)).toBe(true);
    expect(data.stopwatch).toEqual(stored);

    const has_own = clock({ stopwatch: { started_at: null, before_ms: 9, laps: [] } });
    expect(migrate_stopwatch(has_own, stored)).toBe(true);
    expect(has_own.stopwatch?.before_ms).toBe(9);

    const nothing = clock();
    expect(migrate_stopwatch(nothing, null)).toBe(false);
    expect(nothing.stopwatch).toBeUndefined();
  });
});

const timer = (id: string, patch: Partial<Timer> = {}): Timer => ({ id, job: timer_job_id(id), label: "", duration_ms: 60_000, end_at: null, remaining_ms: 60_000, ...patch });
const alarm = (patch: Partial<Alarm> = {}): Alarm => ({ id: "a", job: alarm_job_id("a"), time: "18:00", days: [], label: "", on: true, snooze_until: null, next: null, ...patch });

describe("landing tab", () => {
  const running_stopwatch = { started_at: 1, before_ms: 0, laps: [] };

  it("lands on All with two or more running things and no tab asked for", () => {
    const running = timer("a", { end_at: 1_000 });
    expect(landing_tab(undefined, running_count([running, timer("b", { end_at: 2_000 })], EMPTY_STOPWATCH))).toBe(ClockTab.ALL);
    expect(landing_tab(undefined, running_count([running], running_stopwatch))).toBe(ClockTab.ALL);
    expect(landing_tab(ClockTab.WORLD, 2)).toBeNull();
  });

  it("keeps the last tab with fewer, and doesn't count paused things", () => {
    const paused_stopwatch = { started_at: null, before_ms: 500, laps: [] };
    expect(landing_tab(undefined, running_count([timer("a", { end_at: 1_000 })], EMPTY_STOPWATCH))).toBeNull();
    expect(landing_tab(undefined, running_count([timer("a", { end_at: 1_000 }), timer("b", { remaining_ms: 30_000 })], paused_stopwatch))).toBeNull();
  });
});

describe("active items", () => {
  const now = at(14, 12);

  it("lists running then paused timers, the stopwatch with time on it, and the next alarm", () => {
    const timers = [
      timer("paused", { remaining_ms: 10_000 }),
      timer("late", { end_at: now + 50_000 }),
      timer("soon", { end_at: now + 5_000 }),
      timer("idle"),
      timer("done", { remaining_ms: 0 }),
    ];
    const items = active_items({ timers, stopwatch: { started_at: null, before_ms: 1_200, laps: [] }, alarms: [alarm({ next: at(14, 18) })] }, now);
    expect(items.map((item) => item.key)).toEqual(["timer-soon", "timer-late", "timer-paused", "stopwatch", "alarm-a"]);
    expect(items.map((item) => item.tab)).toEqual([ClockTab.TIMERS, ClockTab.TIMERS, ClockTab.TIMERS, ClockTab.STOPWATCH, ClockTab.ALARMS]);
    expect(items.at(-1)).toMatchObject({ kind: ActiveKind.ALARM, at: at(14, 18) });
  });

  it("leaves out a reset stopwatch and switched-off alarms", () => {
    expect(active_items({ timers: [], stopwatch: EMPTY_STOPWATCH, alarms: [alarm({ on: false })] }, now)).toEqual([]);
  });
});

describe("widget lines", () => {
  it("fits more lines in taller widgets", () => {
    expect([2, 3, 4].map(widget_slots)).toEqual([2, 4, 6]);
  });

  it("shows everything that fits, else trades the last line for +N more", () => {
    expect(fit_items([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], more: 0 });
    expect(fit_items([1, 2, 3, 4], 3)).toEqual({ shown: [1, 2], more: 2 });
    expect(fit_items([1, 2], 1)).toEqual({ shown: [], more: 2 });
    expect(fit_items([], 1)).toEqual({ shown: [], more: 0 });
  });
});
