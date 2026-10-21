import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  after_fire,
  AlarmPlan,
  check_alarm,
  finish_timer,
  format_duration,
  format_stopwatch,
  format_until,
  is_timer_due,
  laps_of,
  next_alarm,
  next_occurrence,
  pause_timer,
  repeat_label,
  reset_timer,
  start_timer,
  stopwatch_elapsed,
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
  fit_items,
  landing_tab,
  migrate_stopwatch,
  stopwatch_of,
  widget_slots,
  type Alarm,
  type ClockData,
  type Timer,
} from "./clock";

// Node re-reads TZ when it changes, so these run in a zone with DST whatever the machine's zone is.
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
let saved_tz: string | undefined;
beforeAll(() => {
  saved_tz = env.TZ;
  env.TZ = "Europe/Ljubljana";
});
afterAll(() => {
  if (saved_tz === undefined) delete env.TZ;
  else env.TZ = saved_tz;
});

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const alarm = (patch: Partial<Alarm> = {}): Alarm => ({
  id: "a",
  time: "07:00",
  days: [],
  label: "",
  enabled: true,
  armed_at: at(2026, 10, 14, 12),
  last_fired: null,
  snooze_until: null,
  ...patch,
});

describe("next_occurrence", () => {
  it("rings later today, else tomorrow", () => {
    expect(next_occurrence({ time: "18:30", days: [] }, at(2026, 10, 14, 12))).toBe(at(2026, 10, 14, 18, 30));
    expect(next_occurrence({ time: "07:00", days: [] }, at(2026, 10, 14, 12))).toBe(at(2026, 10, 15, 7));
    expect(next_occurrence({ time: "12:00", days: [] }, at(2026, 10, 14, 12))).toBe(at(2026, 10, 15, 12));
  });

  it("skips to the next repeat day", () => {
    // 2026-10-14 is a Wednesday.
    expect(next_occurrence({ time: "07:00", days: [1] }, at(2026, 10, 14, 12))).toBe(at(2026, 10, 19, 7));
    expect(next_occurrence({ time: "07:00", days: [3] }, at(2026, 10, 14, 6))).toBe(at(2026, 10, 14, 7));
    expect(next_occurrence({ time: "07:00", days: [3] }, at(2026, 10, 14, 8))).toBe(at(2026, 10, 21, 7));
  });

  it("keeps the wall time across DST changes", () => {
    const before_fall_back = next_occurrence({ time: "07:00", days: [] }, at(2026, 10, 24, 12));
    expect(new Date(before_fall_back).getHours()).toBe(7);
    expect(before_fall_back - at(2026, 10, 24, 7)).toBe(25 * 3_600_000);
    const across_spring = next_occurrence({ time: "07:00", days: [] }, at(2026, 3, 28, 12));
    expect(new Date(across_spring).getHours()).toBe(7);
    expect(across_spring - at(2026, 3, 28, 7)).toBe(23 * 3_600_000);
  });

  it("rings a skipped spring-forward time once, after the jump", () => {
    const skipped = next_occurrence({ time: "02:30", days: [] }, at(2026, 3, 29, 0));
    expect(new Date(skipped).getDate()).toBe(29);
    expect(new Date(skipped).getHours()).toBe(3);
    expect(new Date(next_occurrence({ time: "02:30", days: [] }, skipped)).getDate()).toBe(30);
  });

  it("rings a repeated fall-back time only once", () => {
    const first = next_occurrence({ time: "02:30", days: [] }, at(2026, 10, 25, 0));
    expect(new Date(first).getDate()).toBe(25);
    const second = next_occurrence({ time: "02:30", days: [] }, first);
    expect(new Date(second).getDate()).toBe(26);
  });
});

describe("check_alarm", () => {
  it("waits until the occurrence, then rings it", () => {
    const one = alarm({ time: "13:00" });
    expect(check_alarm(one, at(2026, 10, 14, 12, 59))).toEqual({ plan: AlarmPlan.NONE, at: at(2026, 10, 14, 13), snoozed: false });
    expect(check_alarm(one, at(2026, 10, 14, 13, 0) + 30_000).plan).toBe(AlarmPlan.RING);
  });

  it("reports an occurrence long past as missed, once, at its latest", () => {
    const daily = alarm({ days: [0, 1, 2, 3, 4, 5, 6] });
    const check = check_alarm(daily, at(2026, 10, 17, 9));
    expect(check).toEqual({ plan: AlarmPlan.MISSED, at: at(2026, 10, 17, 7), snoozed: false });
    const fired = after_fire(daily, check);
    expect(fired.enabled).toBe(true);
    expect(check_alarm(fired, at(2026, 10, 17, 9)).plan).toBe(AlarmPlan.NONE);
  });

  it("never rings twice for one occurrence", () => {
    const one = alarm({ time: "13:00", days: [3] });
    const now = at(2026, 10, 14, 13, 0) + 5_000;
    const fired = after_fire(one, check_alarm(one, now));
    expect(check_alarm(fired, now + 60_000)).toEqual({ plan: AlarmPlan.NONE, at: at(2026, 10, 21, 13), snoozed: false });
  });

  it("switches a one-off alarm off after it rings", () => {
    const one = alarm({ time: "13:00" });
    const fired = after_fire(one, check_alarm(one, at(2026, 10, 14, 13)));
    expect(fired.enabled).toBe(false);
    expect(check_alarm(fired, at(2026, 10, 16, 13)).plan).toBe(AlarmPlan.NONE);
  });

  it("ignores occurrences before it was armed", () => {
    const fresh = alarm({ time: "11:00", armed_at: at(2026, 10, 14, 12) });
    expect(check_alarm(fresh, at(2026, 10, 14, 12, 30))).toMatchObject({ plan: AlarmPlan.NONE, at: at(2026, 10, 15, 11) });
  });

  it("rings a snooze, even on a switched-off one-off, then clears it", () => {
    const snoozed = alarm({ enabled: false, snooze_until: at(2026, 10, 14, 13, 10) });
    expect(check_alarm(snoozed, at(2026, 10, 14, 13))).toMatchObject({ plan: AlarmPlan.NONE, snoozed: true });
    const check = check_alarm(snoozed, at(2026, 10, 14, 13, 10));
    expect(check).toMatchObject({ plan: AlarmPlan.RING, snoozed: true });
    expect(after_fire(snoozed, check).snooze_until).toBeNull();
  });

  it("is off when disabled", () => {
    expect(check_alarm(alarm({ enabled: false }), at(2026, 10, 15, 7))).toEqual({ plan: AlarmPlan.NONE, at: null, snoozed: false });
  });
});

describe("next_alarm", () => {
  it("picks the soonest enabled alarm", () => {
    const now = at(2026, 10, 14, 12);
    const alarms = [alarm({ id: "a", time: "09:00" }), alarm({ id: "b", time: "20:00" }), alarm({ id: "c", time: "13:00", enabled: false })];
    expect(next_alarm(alarms, now)).toEqual({ alarm: alarms[1], at: at(2026, 10, 14, 20) });
    expect(next_alarm([], now)).toBeNull();
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
    expect(format_until(7 * 3_600_000 + 12 * 60_000)).toBe("in 7 h 12 min");
    expect(format_until(26 * 3_600_000)).toBe("in 1 d 2 h");
    expect(format_duration(25 * 60_000)).toBe("25 min");
    expect(format_duration(90 * 60_000 + 5_000)).toBe("1 h 30 min 5 s");
  });
});

describe("timers", () => {
  const timer: Timer = { id: "t", label: "Tea", duration_ms: 180_000, end_at: null, remaining_ms: 180_000 };

  it("runs, pauses and resumes on wall-clock time", () => {
    expect(timer_state(timer)).toBe(TimerState.IDLE);
    const running = start_timer(timer, 1_000);
    expect(timer_state(running)).toBe(TimerState.RUNNING);
    expect(timer_remaining(running, 61_000)).toBe(120_000);
    const paused = pause_timer(running, 61_000);
    expect(timer_state(paused)).toBe(TimerState.PAUSED);
    expect(timer_remaining(paused, 999_999)).toBe(120_000);
    const resumed = start_timer(paused, 100_000);
    expect(resumed.end_at).toBe(220_000);
  });

  it("is due at its end and finishes at zero", () => {
    const running = start_timer(timer, 0);
    expect(is_timer_due(running, 179_999)).toBe(false);
    expect(is_timer_due(running, 180_000)).toBe(true);
    const done = finish_timer(running);
    expect(timer_state(done)).toBe(TimerState.DONE);
    expect(is_timer_due(done, 999_999)).toBe(false);
    expect(start_timer(done, 0).end_at).toBe(180_000);
    expect(timer_state(reset_timer(done))).toBe(TimerState.IDLE);
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

const clock = (patch: Partial<ClockData> = {}): ClockData => ({ ...structuredClone(EMPTY_CLOCK), ...patch });
const timer = (id: string, patch: Partial<Timer> = {}): Timer => ({ id, label: "", duration_ms: 60_000, end_at: null, remaining_ms: 60_000, ...patch });

describe("stopwatch in the data file", () => {
  it("reads files without one, and drops a broken one instead of the file", () => {
    const old = { version: 1, zones: ["Asia/Tokyo"], alarms: [], timers: [] };
    const parsed = ClockDataSchema.parse(old);
    expect(stopwatch_of(parsed)).toEqual({ started_at: null, before_ms: 0, laps: [] });
    const broken = ClockDataSchema.parse({ ...old, stopwatch: { started_at: "soon" } });
    expect(broken.zones).toEqual(["Asia/Tokyo"]);
    expect(broken.stopwatch).toBeUndefined();
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

describe("landing tab", () => {
  it("lands on All with two or more running things and no tab asked for", () => {
    const running = timer("a", { end_at: 1_000 });
    const two_timers = clock({ timers: [running, timer("b", { end_at: 2_000 })] });
    const timer_and_stopwatch = clock({ timers: [running], stopwatch: { started_at: 1, before_ms: 0, laps: [] } });
    expect(landing_tab(undefined, two_timers)).toBe(ClockTab.ALL);
    expect(landing_tab(undefined, timer_and_stopwatch)).toBe(ClockTab.ALL);
    expect(landing_tab(ClockTab.WORLD, two_timers)).toBeNull();
  });

  it("keeps the last tab with fewer, and doesn't count paused things", () => {
    const paused_stopwatch = { started_at: null, before_ms: 500, laps: [] };
    expect(landing_tab(undefined, clock({ timers: [timer("a", { end_at: 1_000 })] }))).toBeNull();
    expect(landing_tab(undefined, clock({ timers: [timer("a", { end_at: 1_000 }), timer("b", { remaining_ms: 30_000 })], stopwatch: paused_stopwatch }))).toBeNull();
  });
});

describe("active items", () => {
  const now = at(2026, 10, 14, 12);

  it("lists running then paused timers, the stopwatch with time on it, and the next alarm", () => {
    const data = clock({
      timers: [
        timer("paused", { remaining_ms: 10_000 }),
        timer("late", { end_at: now + 50_000 }),
        timer("soon", { end_at: now + 5_000 }),
        timer("idle"),
        timer("done", { remaining_ms: 0 }),
      ],
      stopwatch: { started_at: null, before_ms: 1_200, laps: [] },
      alarms: [alarm({ time: "18:00" })],
    });
    const items = active_items(data, now);
    expect(items.map((item) => item.key)).toEqual(["timer-soon", "timer-late", "timer-paused", "stopwatch", "alarm-a"]);
    expect(items.map((item) => item.tab)).toEqual([ClockTab.TIMERS, ClockTab.TIMERS, ClockTab.TIMERS, ClockTab.STOPWATCH, ClockTab.ALARMS]);
    expect(items.at(-1)).toMatchObject({ kind: ActiveKind.ALARM, at: at(2026, 10, 14, 18) });
  });

  it("leaves out a reset stopwatch and switched-off alarms", () => {
    expect(active_items(clock({ stopwatch: { started_at: null, before_ms: 0, laps: [] }, alarms: [alarm({ enabled: false })] }), now)).toEqual([]);
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
