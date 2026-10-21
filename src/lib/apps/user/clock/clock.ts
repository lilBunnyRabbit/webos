import { z } from "zod";
import { JobKind, pending, type Job, type JobAt, type JobId, type JobInput } from "$lib/core/api/services/scheduler";
import { add_days, format_date_key, local_date, parse_plain_time, wall_to_epoch } from "$lib/core/utils/zoned";
import { CLOCK_PROPS, ClockFace, ClockTab } from "./props";

export const APP_ID = "clock";
export const DATA_FILE = "clock.json";

export const MINUTE = 60_000;

export const AlarmExtrasSchema = z.object({ label: z.string() });
export type AlarmExtras = z.infer<typeof AlarmExtrasSchema>;

/** `left_ms` is the time left while it isn't running. */
export const TimerExtrasSchema = z.object({
  label: z.string(),
  duration_ms: z.number().int().positive(),
  left_ms: z.number().min(0).optional(),
});
export type TimerExtras = z.infer<typeof TimerExtrasSchema>;

export interface Alarm {
  id: string;
  job: JobId;
  time: string;
  /** Weekdays it repeats on, `0` = Sunday. Empty rings once. */
  days: number[];
  label: string;
  on: boolean;
  snooze_until: number | null;
  next: number | null;
}

export interface AlarmDraft {
  id: string | null;
  time: string;
  days: number[];
  label: string;
}

export type AlarmSpec = Omit<AlarmDraft, "id">;

export interface Timer {
  id: string;
  job: JobId;
  label: string;
  duration_ms: number;
  end_at: number | null;
  /** The time left while it isn't running; 0 once it's done. */
  remaining_ms: number;
}

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
  /** Files from before the scheduler held whole alarms and timers here as arrays; they're dropped, zones kept. */
  alarms: z.record(z.string(), AlarmExtrasSchema).catch({}),
  timers: z.record(z.string(), TimerExtrasSchema).catch({}),
  /** Optional: files from before it moved here lack it. A broken one is dropped rather than the whole file. */
  stopwatch: StopwatchSchema.optional().catch(undefined),
});
export type ClockData = z.infer<typeof ClockDataSchema>;

export const EMPTY_CLOCK: ClockData = { version: 1, zones: [], alarms: {}, timers: {} };

export function new_id(): string {
  return crypto.randomUUID().slice(0, 8);
}

const ALARM_PREFIX = `${APP_ID}:alarm-`;
const TIMER_PREFIX = `${APP_ID}:timer-`;

export const alarm_job_id = (id: string): JobId => `${ALARM_PREFIX}${id}`;
export const timer_job_id = (id: string): JobId => `${TIMER_PREFIX}${id}`;

export function next_wall(time: string, now: number, zone: string): JobAt {
  const today = local_date(now, zone);
  const date = wall_to_epoch(today, parse_plain_time(time)!, zone) > now ? today : add_days(today, 1);
  return { date: format_date_key(date), time, tz: zone };
}

/**
 * The scheduler job of an alarm, in `zone` (the device's when it's made). One that repeats starts counting today; the
 * scheduler skips an occurrence already past. One that doesn't is the next time the clock reads `time`.
 */
export function alarm_input(id: string, spec: AlarmSpec, now: number, zone: string): JobInput {
  const days = [...new Set(spec.days)].sort((a, b) => a - b);
  const input: JobInput = {
    key: `alarm-${id}`,
    title: spec.label || "Alarm",
    message: `${spec.time} · ${repeat_label(days)}`,
    at: days.length > 0 ? { date: format_date_key(local_date(now, zone)), time: spec.time, tz: zone } : next_wall(spec.time, now, zone),
    kind: JobKind.ALARM,
    actions: [
      { label: "Snooze 10 min", command: `alarm snooze ${id}` },
      { label: "Stop", command: `alarm stop ${id}` },
    ],
    open: { app: APP_ID, props: { tab: ClockTab.ALARMS } },
  };
  if (days.length > 0) input.repeat = { every: "week", days };
  return input;
}

export function timer_input(id: string, label: string, duration_ms: number, end_at: number): JobInput {
  return {
    key: `timer-${id}`,
    title: `${label || "Timer"} is done`,
    message: format_duration(duration_ms),
    at: { epoch: end_at },
    kind: JobKind.TIMER,
    actions: [
      { label: "Restart", command: `timer restart ${id}` },
      { label: "Stop", command: `timer stop ${id}` },
    ],
    open: { app: APP_ID, props: { tab: ClockTab.TIMERS } },
  };
}

export function alarm_of(job: Job, extras: AlarmExtras | undefined): Alarm | null {
  if (job.kind !== JobKind.ALARM || !job.id.startsWith(ALARM_PREFIX) || "epoch" in job.at) return null;
  return {
    id: job.id.slice(ALARM_PREFIX.length),
    job: job.id,
    time: job.at.time,
    days: job.repeat?.every === "week" ? [...job.repeat.days].sort((a, b) => a - b) : [],
    label: extras?.label ?? "",
    on: job.armed,
    snooze_until: job.snooze_until ?? null,
    next: pending(job),
  };
}

export function timer_of(job: Job, extras: TimerExtras | undefined): Timer | null {
  if (job.kind !== JobKind.TIMER || !job.id.startsWith(TIMER_PREFIX) || !("epoch" in job.at)) return null;
  const end = job.at.epoch;
  // A job someone else scheduled has no extras: its length is from when it was armed to its end.
  const duration_ms = extras?.duration_ms ?? Math.max(1000, end - (job.armed_at ?? end));
  return {
    id: job.id.slice(TIMER_PREFIX.length),
    job: job.id,
    label: extras?.label ?? "",
    duration_ms,
    end_at: job.armed ? end : null,
    remaining_ms: job.armed ? duration_ms : (extras?.left_ms ?? 0),
  };
}

export function clock_alarms(jobs: Job[], data: ClockData): Alarm[] {
  return jobs
    .flatMap((job) => (job.app === APP_ID ? (alarm_of(job, data.alarms[job.id]) ?? []) : []))
    .sort((a, b) => a.time.localeCompare(b.time));
}

export function clock_timers(jobs: Job[], data: ClockData): Timer[] {
  return jobs.flatMap((job) => (job.app === APP_ID ? (timer_of(job, data.timers[job.id]) ?? []) : []));
}

export function drop_orphans(data: ClockData, jobs: Job[]): void {
  const ids = new Set(jobs.map((job) => job.id));
  for (const id of Object.keys(data.alarms)) if (!ids.has(id)) delete data.alarms[id];
  for (const id of Object.keys(data.timers)) if (!ids.has(id)) delete data.timers[id];
}

export function next_alarm(alarms: Alarm[], now: number): { alarm: Alarm; at: number } | null {
  let best: { alarm: Alarm; at: number } | null = null;
  for (const alarm of alarms) {
    if (alarm.next !== null && alarm.next > now && (!best || alarm.next < best.at)) best = { alarm, at: alarm.next };
  }
  return best;
}

export function is_snoozed(alarm: Alarm, now: number): boolean {
  return alarm.on && alarm.snooze_until !== null && alarm.snooze_until > now && alarm.next === alarm.snooze_until;
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

export function time_to_run(timer: Timer): number {
  return timer.remaining_ms > 0 ? timer.remaining_ms : timer.duration_ms;
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

export function running_count(timers: Timer[], stopwatch: StopwatchState): number {
  return timers.filter((timer) => timer.end_at !== null).length + (stopwatch.started_at !== null ? 1 : 0);
}

export function landing_tab(requested: ClockTab | undefined, running: number): ClockTab | null {
  return requested === undefined && running >= 2 ? ClockTab.ALL : null;
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

export interface ClockView {
  alarms: Alarm[];
  timers: Timer[];
  stopwatch: StopwatchState;
}

export function active_items({ alarms, timers, stopwatch }: ClockView, now: number): ActiveItem[] {
  const active = timers
    .filter(is_timer_active)
    .sort((a, b) => Number(a.end_at === null) - Number(b.end_at === null) || timer_remaining(a, now) - timer_remaining(b, now));
  const items: ActiveItem[] = active.map((timer) => ({ kind: ActiveKind.TIMER, key: `timer-${timer.id}`, tab: ClockTab.TIMERS, timer }));
  if (is_stopwatch_active(stopwatch)) items.push({ kind: ActiveKind.STOPWATCH, key: "stopwatch", tab: ClockTab.STOPWATCH, stopwatch });
  const upcoming = next_alarm(alarms, now);
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
