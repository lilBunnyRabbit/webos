import { z } from "zod";
import { CLOCK_PROPS, ClockFace, ClockTab } from "./props";

export const APP_ID = "clock";
export const DATA_FILE = "clock.json";

export const MINUTE = 60_000;

/** An alarm older than this when first noticed (WebOS was closed) is reported as missed instead of ringing. */
export const MISSED_AFTER_MS = 10 * MINUTE;
export const SNOOZE_MS = 10 * MINUTE;

export const AlarmSchema = z.object({
  id: z.string(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** Weekdays it repeats on, `0` = Sunday (as `Date.getDay()`). Empty rings once. */
  days: z.array(z.number().int().min(0).max(6)),
  label: z.string(),
  enabled: z.boolean(),
  /** Only occurrences after this instant count: set when the alarm is created, edited or switched on. */
  armed_at: z.number(),
  /** The occurrence that last rang (or was missed). Every host checks it before ringing, so one ring per occurrence. */
  last_fired: z.number().nullable(),
  snooze_until: z.number().nullable(),
});
export type Alarm = z.infer<typeof AlarmSchema>;

export interface AlarmDraft {
  id: string | null;
  time: string;
  days: number[];
  label: string;
}

export const TimerSchema = z.object({
  id: z.string(),
  label: z.string(),
  duration_ms: z.number().int().positive(),
  end_at: z.number().nullable(),
  remaining_ms: z.number().min(0),
});
export type Timer = z.infer<typeof TimerSchema>;

export interface StopwatchState {
  started_at: number | null;
  before_ms: number;
  laps: number[];
}

export const StopwatchSchema = z.object({
  started_at: z.number().nullable(),
  before_ms: z.number().min(0),
  laps: z.array(z.number()),
});

export const EMPTY_STOPWATCH: StopwatchState = { started_at: null, before_ms: 0, laps: [] };

export const ClockDataSchema = z.object({
  version: z.literal(1),
  zones: z.array(z.string()),
  alarms: z.array(AlarmSchema),
  timers: z.array(TimerSchema),
  /** Optional: files from before it moved here lack it. A broken one is dropped rather than the whole file. */
  stopwatch: StopwatchSchema.optional().catch(undefined),
});
export type ClockData = z.infer<typeof ClockDataSchema>;

export const EMPTY_CLOCK: ClockData = { version: 1, zones: [], alarms: [], timers: [] };

export function new_id(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function parse_time(time: string): { hours: number; minutes: number } {
  const [hours, minutes] = time.split(":").map(Number);
  return { hours, minutes };
}

/**
 * The first time after `after` the alarm rings, in local time. Days are stepped on the calendar, not by 24 h, so a
 * DST change never moves it. A time skipped by spring-forward rings when the clock jumps past it; a time repeated by
 * fall-back rings at its first pass only.
 */
export function next_occurrence(alarm: Pick<Alarm, "time" | "days">, after: number): number {
  const { hours, minutes } = parse_time(alarm.time);
  const base = new Date(after);
  for (let offset = 0; offset <= 8; offset++) {
    const candidate = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset, hours, minutes);
    if (candidate.getTime() <= after) continue;
    if (alarm.days.length === 0 || alarm.days.includes(candidate.getDay())) return candidate.getTime();
  }
  throw new Error(`No occurrence for ${alarm.time}`);
}

export const AlarmPlan = { NONE: "none", RING: "ring", MISSED: "missed" } as const;
export type AlarmPlan = (typeof AlarmPlan)[keyof typeof AlarmPlan];

export interface AlarmCheck {
  plan: AlarmPlan;
  at: number | null;
  snoozed: boolean;
}

export function check_alarm(alarm: Alarm, now: number, missed_after = MISSED_AFTER_MS): AlarmCheck {
  if (alarm.snooze_until !== null) {
    return alarm.snooze_until <= now
      ? { plan: AlarmPlan.RING, at: alarm.snooze_until, snoozed: true }
      : { plan: AlarmPlan.NONE, at: alarm.snooze_until, snoozed: true };
  }
  if (!alarm.enabled) return { plan: AlarmPlan.NONE, at: null, snoozed: false };
  const due = next_occurrence(alarm, Math.max(alarm.armed_at, alarm.last_fired ?? -Infinity));
  if (due > now) return { plan: AlarmPlan.NONE, at: due, snoozed: false };
  let latest = due;
  for (let next = next_occurrence(alarm, latest); next <= now; next = next_occurrence(alarm, latest)) latest = next;
  return { plan: now - latest <= missed_after ? AlarmPlan.RING : AlarmPlan.MISSED, at: latest, snoozed: false };
}

export function after_fire(alarm: Alarm, check: AlarmCheck): Alarm {
  if (check.snoozed) return { ...alarm, snooze_until: null };
  return { ...alarm, last_fired: check.at, enabled: alarm.days.length > 0 && alarm.enabled };
}

export function next_alarm(alarms: Alarm[], now: number): { alarm: Alarm; at: number } | null {
  let best: { alarm: Alarm; at: number } | null = null;
  for (const alarm of alarms) {
    const { at } = check_alarm(alarm, now);
    if (at !== null && at > now && (!best || at < best.at)) best = { alarm, at };
  }
  return best;
}

export const WEEK = [
  { day: 1, short: "Mon", initial: "M" },
  { day: 2, short: "Tue", initial: "T" },
  { day: 3, short: "Wed", initial: "W" },
  { day: 4, short: "Thu", initial: "T" },
  { day: 5, short: "Fri", initial: "F" },
  { day: 6, short: "Sat", initial: "S" },
  { day: 0, short: "Sun", initial: "S" },
] as const;

export function repeat_label(days: number[]): string {
  const set = new Set(days);
  if (set.size === 0) return "Once";
  if (set.size === 7) return "Every day";
  if (set.size === 5 && [1, 2, 3, 4, 5].every((day) => set.has(day))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return WEEK.filter((entry) => set.has(entry.day))
    .map((entry) => entry.short)
    .join(", ");
}

export function format_until(ms: number): string {
  if (ms < MINUTE) return "in under a minute";
  const total = Math.round(ms / MINUTE);
  const days = Math.floor(total / (24 * 60));
  const hours = Math.floor((total % (24 * 60)) / 60);
  const minutes = total % 60;
  if (days) return hours ? `in ${days} d ${hours} h` : `in ${days} d`;
  if (hours) return minutes ? `in ${hours} h ${minutes} min` : `in ${hours} h`;
  return `in ${minutes} min`;
}

export function format_duration(ms: number): string {
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const parts = [hours && `${hours} h`, minutes && `${minutes} min`, seconds && `${seconds} s`].filter(Boolean);
  return parts.length ? parts.join(" ") : "0 s";
}

export function format_hm(at: number): string {
  const date = new Date(at);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export const TimerState = { IDLE: "idle", RUNNING: "running", PAUSED: "paused", DONE: "done" } as const;
export type TimerState = (typeof TimerState)[keyof typeof TimerState];

export function timer_state(timer: Timer): TimerState {
  if (timer.end_at !== null) return TimerState.RUNNING;
  if (timer.remaining_ms <= 0) return TimerState.DONE;
  return timer.remaining_ms >= timer.duration_ms ? TimerState.IDLE : TimerState.PAUSED;
}

export function timer_remaining(timer: Timer, now: number): number {
  return timer.end_at === null ? timer.remaining_ms : Math.max(0, timer.end_at - now);
}

export function start_timer(timer: Timer, now: number): Timer {
  const remaining = timer.remaining_ms > 0 ? timer.remaining_ms : timer.duration_ms;
  return { ...timer, end_at: now + remaining, remaining_ms: remaining };
}

export function pause_timer(timer: Timer, now: number): Timer {
  return { ...timer, end_at: null, remaining_ms: timer_remaining(timer, now) };
}

export function reset_timer(timer: Timer): Timer {
  return { ...timer, end_at: null, remaining_ms: timer.duration_ms };
}

export function is_timer_due(timer: Timer, now: number): boolean {
  return timer.end_at !== null && timer.end_at <= now;
}

export function finish_timer(timer: Timer): Timer {
  return { ...timer, end_at: null, remaining_ms: 0 };
}

/** Wall-clock based, so it keeps counting while the window is hidden or closed. */
export function stopwatch_elapsed(state: StopwatchState, now: number): number {
  return state.before_ms + (state.started_at === null ? 0 : Math.max(0, now - state.started_at));
}

export interface Lap {
  n: number;
  split_ms: number;
  total_ms: number;
}

export function toggle_stopwatch(state: StopwatchState, now: number): StopwatchState {
  return state.started_at === null
    ? { ...state, started_at: now }
    : { ...state, started_at: null, before_ms: stopwatch_elapsed(state, now) };
}

export function lap_stopwatch(state: StopwatchState, now: number): StopwatchState {
  return { ...state, laps: [...state.laps, stopwatch_elapsed(state, now)] };
}

export function laps_of(state: StopwatchState): Lap[] {
  return state.laps
    .map((total_ms, index) => ({ n: index + 1, total_ms, split_ms: total_ms - (state.laps[index - 1] ?? 0) }))
    .reverse();
}

export function format_stopwatch(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 10));
  const hundredths = String(safe % 100).padStart(2, "0");
  const total = Math.floor(safe / 100);
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours ? `${hours}:` : ""}${minutes}:${seconds}.${hundredths}`;
}

export function stopwatch_of(data: ClockData): StopwatchState {
  return data.stopwatch ?? EMPTY_STOPWATCH;
}

export function is_stopwatch_active(state: StopwatchState): boolean {
  return state.started_at !== null || state.before_ms > 0;
}

/**
 * The stopwatch used to live in `app.clock.stopwatch` localStorage. Copies it into the data file unless the file
 * already has one. True when the old key can go.
 */
export function migrate_stopwatch(data: ClockData, stored: StopwatchState | null): boolean {
  if (!stored) return false;
  data.stopwatch ??= stored;
  return true;
}

export function running_count(data: ClockData): number {
  const timers = data.timers.filter((timer) => timer.end_at !== null).length;
  return timers + (stopwatch_of(data).started_at !== null ? 1 : 0);
}

export function landing_tab(requested: ClockTab | undefined, data: ClockData): ClockTab | null {
  return requested === undefined && running_count(data) >= 2 ? ClockTab.ALL : null;
}

export const ActiveKind = { TIMER: "timer", STOPWATCH: "stopwatch", ALARM: "alarm" } as const;
export type ActiveKind = (typeof ActiveKind)[keyof typeof ActiveKind];

export type ActiveItem =
  | { kind: typeof ActiveKind.TIMER; key: string; tab: ClockTab; timer: Timer }
  | { kind: typeof ActiveKind.STOPWATCH; key: string; tab: ClockTab; stopwatch: StopwatchState }
  | { kind: typeof ActiveKind.ALARM; key: string; tab: ClockTab; alarm: Alarm; at: number };

function is_timer_active(timer: Timer): boolean {
  const state = timer_state(timer);
  return state === TimerState.RUNNING || state === TimerState.PAUSED;
}

export function active_items(data: ClockData, now: number): ActiveItem[] {
  const timers = data.timers
    .filter(is_timer_active)
    .sort((a, b) => Number(a.end_at === null) - Number(b.end_at === null) || timer_remaining(a, now) - timer_remaining(b, now));
  const items: ActiveItem[] = timers.map((timer) => ({ kind: ActiveKind.TIMER, key: `timer-${timer.id}`, tab: ClockTab.TIMERS, timer }));
  const stopwatch = stopwatch_of(data);
  if (is_stopwatch_active(stopwatch)) items.push({ kind: ActiveKind.STOPWATCH, key: "stopwatch", tab: ClockTab.STOPWATCH, stopwatch });
  const upcoming = next_alarm(data.alarms, now);
  if (upcoming) items.push({ kind: ActiveKind.ALARM, key: `alarm-${upcoming.alarm.id}`, tab: ClockTab.ALARMS, ...upcoming });
  return items;
}

export function widget_slots(h: number): number {
  return Math.max(2, 2 * h - 2);
}

/** Up to `slots` lines; when they don't all fit, the last one becomes "+N more". */
export function fit_items<T>(items: T[], slots: number): { shown: T[]; more: number } {
  if (items.length <= slots) return { shown: items, more: 0 };
  const shown = items.slice(0, Math.max(0, slots - 1));
  return { shown, more: items.length - shown.length };
}

export { CLOCK_PROPS, ClockFace, ClockTab };

const UNITS: Record<string, number> = { h: 3_600_000, m: MINUTE, s: 1000 };

/** `5m`, `1h30m`, `90s`; a bare number is minutes. Null when it isn't one, or is zero. */
export function parse_duration(text: string): number | null {
  const input = text.trim().toLowerCase();
  if (/^\d+$/.test(input)) return Number(input) * MINUTE || null;
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(input);
  if (!match || !input) return null;
  const [, hours = "0", minutes = "0", seconds = "0"] = match;
  return Number(hours) * UNITS.h + Number(minutes) * UNITS.m + Number(seconds) * UNITS.s || null;
}

export function parse_alarm_time(text: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? `${String(hours).padStart(2, "0")}:${match[2]}` : null;
}

const DAY_SETS: Record<string, number[]> = {
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
  daily: [0, 1, 2, 3, 4, 5, 6],
  once: [],
};

export function parse_days(text: string): number[] | null {
  const input = text.trim().toLowerCase();
  if (input in DAY_SETS) return DAY_SETS[input];
  const days = new Set<number>();
  for (const part of input.split(",")) {
    const entry = WEEK.find((day) => day.short.toLowerCase() === part.trim().slice(0, 3) && part.trim().length >= 2);
    if (!entry) return null;
    days.add(entry.day);
  }
  return [...days].sort((a, b) => a - b);
}

/** A string is the error to show. */
export function find_entry<T extends { id: string; label: string }>(entries: T[], query: string, noun: string): T | string {
  const by_id = entries.filter((entry) => entry.id.startsWith(query));
  if (by_id.length === 1) return by_id[0];
  if (by_id.length > 1) return `${noun} id "${query}" is ambiguous`;
  const by_label = entries.filter((entry) => entry.label.toLowerCase() === query.toLowerCase());
  if (by_label.length === 1) return by_label[0];
  return by_label.length > 1 ? `more than one ${noun} is called "${query}"` : `no ${noun} "${query}"`;
}
