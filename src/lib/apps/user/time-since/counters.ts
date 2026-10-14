import { z } from "zod";

export const APP_ID = "time-since";
export const COUNTERS_FILE = "counters.json";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const YEAR = 365 * DAY;

export const RunSchema = z.object({ started_at: z.number(), ended_at: z.number() });
export type Run = z.infer<typeof RunSchema>;

export const CounterSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.number(),
  current_start: z.number().nullable(),
  runs: z.array(RunSchema),
});
export type Counter = z.infer<typeof CounterSchema>;

export const CountersFileSchema = z.object({ version: z.literal(1), counters: z.array(CounterSchema) });
export type CountersFile = z.infer<typeof CountersFileSchema>;

export const EMPTY_FILE: CountersFile = { version: 1, counters: [] };

export const CounterSort = { LONGEST: "longest", RECENT: "recent", NAME: "name", CREATED: "created" } as const;
export type CounterSort = (typeof CounterSort)[keyof typeof CounterSort];

export const SORT_OPTIONS: { value: CounterSort; label: string }[] = [
  { value: CounterSort.LONGEST, label: "Longest running" },
  { value: CounterSort.RECENT, label: "Most recent" },
  { value: CounterSort.NAME, label: "Name" },
  { value: CounterSort.CREATED, label: "Created" },
];

export function create_counter(name: string, now: number, id: string): Counter {
  return { id, name: name.trim(), created_at: now, current_start: now, runs: [] };
}

export function elapsed_of(counter: Counter, now: number): number {
  return counter.current_start === null ? 0 : Math.max(0, now - counter.current_start);
}

export function reset(counter: Counter, now: number): Counter {
  if (counter.current_start === null) return start(counter, now);
  return {
    ...counter,
    runs: [...counter.runs, { started_at: counter.current_start, ended_at: now }],
    current_start: now,
  };
}

export function stop(counter: Counter, now: number): Counter {
  if (counter.current_start === null) return counter;
  return {
    ...counter,
    runs: [...counter.runs, { started_at: counter.current_start, ended_at: now }],
    current_start: null,
  };
}

export function start(counter: Counter, now: number): Counter {
  if (counter.current_start !== null) return counter;
  return { ...counter, current_start: now };
}

export function set_start(counter: Counter, at: number, now: number): Counter {
  if (counter.current_start === null || !Number.isFinite(at)) return counter;
  const floor = counter.runs.at(-1)?.ended_at ?? -Infinity;
  return { ...counter, current_start: Math.min(now, Math.max(floor, at)) };
}

/**
 * Deletes run `index`. Deleting the newest run undoes the reset or stop that ended it: a running counter whose run
 * began when that one ended carries on from the deleted run's start, and a stopped counter resumes from it.
 */
export function remove_run(counter: Counter, index: number): Counter {
  const run = counter.runs[index];
  if (!run) return counter;
  const runs = counter.runs.filter((_, i) => i !== index);
  const is_latest = index === counter.runs.length - 1;
  const undoes = is_latest && (counter.current_start === null || counter.current_start === run.ended_at);
  return { ...counter, runs, current_start: undoes ? run.started_at : counter.current_start };
}

export function rename(counter: Counter, name: string): Counter {
  const trimmed = name.trim();
  return trimmed ? { ...counter, name: trimmed } : counter;
}

export function duration_of(run: Run): number {
  return Math.max(0, run.ended_at - run.started_at);
}

export interface RunStats {
  count: number;
  total: number;
  average: number;
  shortest: number;
  longest: number;
}

export function stats_of(runs: Run[]): RunStats | null {
  if (runs.length === 0) return null;
  const durations = runs.map(duration_of);
  const total = durations.reduce((sum, ms) => sum + ms, 0);
  return {
    count: runs.length,
    total,
    average: total / runs.length,
    shortest: Math.min(...durations),
    longest: Math.max(...durations),
  };
}

export function is_record(counter: Counter, now: number): boolean {
  if (counter.current_start === null || counter.runs.length === 0) return false;
  return elapsed_of(counter, now) > Math.max(...counter.runs.map(duration_of));
}

export function sort_counters(counters: Counter[], sort: CounterSort): Counter[] {
  const running = (counter: Counter) => (counter.current_start === null ? 1 : 0);
  const last_activity = (counter: Counter) =>
    counter.current_start ?? counter.runs.at(-1)?.ended_at ?? counter.created_at;
  return [...counters].sort((a, b) => {
    switch (sort) {
      case CounterSort.NAME:
        return a.name.localeCompare(b.name);
      case CounterSort.CREATED:
        return b.created_at - a.created_at;
      case CounterSort.RECENT:
        return running(a) - running(b) || last_activity(b) - last_activity(a);
      default:
        return running(a) - running(b) || last_activity(a) - last_activity(b);
    }
  });
}

export interface DurationPart {
  value: string;
  unit: string;
}

/** Two largest units ("3 d 4 h"); seconds only under an hour, the only range where they tick visibly. */
export function duration_parts(ms: number): DurationPart[] {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const years = Math.floor((total * SECOND) / YEAR);
  const days = Math.floor((total * SECOND - years * YEAR) / DAY);
  const hours = Math.floor((total % (DAY / SECOND)) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const part = (value: number, unit: string, pad = false) => ({
    value: pad ? String(value).padStart(2, "0") : String(value),
    unit,
  });
  const pair = (major: DurationPart, minor: DurationPart, keep_zero = false) =>
    keep_zero || minor.value !== "0" ? [major, minor] : [major];
  if (years > 0) return pair(part(years, "y"), part(days, "d"));
  if (days > 0) return pair(part(days, "d"), part(hours, "h"));
  if (hours > 0) return pair(part(hours, "h"), part(minutes, "m", true), true);
  if (minutes > 0) return pair(part(minutes, "m"), part(seconds, "s", true), true);
  return [part(seconds, "s")];
}

/** A live counter: every unit from the largest one in use down to seconds, so it visibly ticks (owner, 2026-10-15). */
export function live_parts(ms: number): DurationPart[] {
  const total = Math.max(0, Math.floor(ms / SECOND));
  const years = Math.floor((total * SECOND) / YEAR);
  const days = Math.floor((total * SECOND - years * YEAR) / DAY);
  const units: [number, string][] = [
    [years, "y"],
    [days, "d"],
    [Math.floor((total % (DAY / SECOND)) / 3600), "h"],
    [Math.floor((total % 3600) / 60), "m"],
    [total % 60, "s"],
  ];
  const first = units.findIndex(([value]) => value > 0);
  return units.slice(first === -1 ? units.length - 1 : first).map(([value, unit], index) => ({
    value: index === 0 ? String(value) : String(value).padStart(2, "0"),
    unit,
  }));
}

export function format_live(ms: number): string {
  return live_parts(ms)
    .map((part) => `${part.value} ${part.unit}`)
    .join(" ");
}

export function format_duration(ms: number): string {
  return duration_parts(ms)
    .map((part) => `${part.value} ${part.unit}`)
    .join(" ");
}

export function heatmap_of(runs: Run[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const run of runs) {
    const date = new Date(run.ended_at);
    grid[(date.getDay() + 6) % 7][date.getHours()]++;
  }
  return grid;
}

export function to_datetime_local(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function from_datetime_local(value: string): number {
  return value ? new Date(value).getTime() : NaN;
}

export function update_counter(file: CountersFile, id: string, change: (counter: Counter) => Counter): CountersFile {
  return { ...file, counters: file.counters.map((counter) => (counter.id === id ? change(counter) : counter)) };
}

/** Id prefix, then exact name, then name prefix, then any part of the name (case-insensitive). A string is the error to show. */
export function resolve_counter(counters: Counter[], query: string): Counter | string {
  const q = query.trim().toLowerCase();
  if (!q) return "no counter given";
  const tiers = [
    counters.filter((counter) => counter.id.startsWith(q)),
    counters.filter((counter) => counter.name.toLowerCase() === q),
    counters.filter((counter) => counter.name.toLowerCase().startsWith(q)),
    counters.filter((counter) => counter.name.toLowerCase().includes(q)),
  ];
  for (const found of tiers) {
    if (found.length === 1) return found[0];
    if (found.length > 1) return `"${query}" matches ${found.map((counter) => counter.name).join(", ")}`;
  }
  return `no counter "${query}"`;
}
