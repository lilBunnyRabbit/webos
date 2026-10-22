export const MOODS = [1, 2, 3, 4, 5] as const;
export type Mood = (typeof MOODS)[number];

export const MOOD_LABELS: Record<Mood, string> = { 1: "Awful", 2: "Bad", 3: "Okay", 4: "Good", 5: "Great" };

export function mood_level(average: number): Mood {
  return Math.min(5, Math.max(1, Math.round(average))) as Mood;
}

export interface Details {
  activities?: string[];
  energy?: number;
  sleep?: number;
}

export interface MoodFields {
  date: string;
  mood?: number;
  activities?: string[];
  energy?: number;
  sleep?: number;
}

export interface DayStat {
  date: string;
  entries: number;
  mood: number | null;
  activities: Set<string>;
  energy: number | null;
  sleep: number | null;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** One row per day with an entry. A mood tap alone is an entry, so it counts as a day written. */
export function day_stats(entries: readonly MoodFields[]): Map<string, DayStat> {
  const grouped = new Map<string, MoodFields[]>();
  for (const entry of entries) grouped.set(entry.date, [...(grouped.get(entry.date) ?? []), entry]);
  const days = new Map<string, DayStat>();
  for (const [date, list] of grouped) {
    const pick = (field: "mood" | "energy" | "sleep") =>
      average(list.flatMap((entry) => (entry[field] === undefined ? [] : [entry[field]])));
    days.set(date, {
      date,
      entries: list.length,
      mood: pick("mood"),
      activities: new Set(list.flatMap((entry) => entry.activities ?? [])),
      energy: pick("energy"),
      sleep: pick("sleep"),
    });
  }
  return days;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function utc(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return Date.UTC(year, month - 1, date);
}

function key_of(time: number): string {
  const date = new Date(time);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function local_date(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function add_days(day: string, by: number): string {
  return key_of(utc(day) + by * 86_400_000);
}

export function days_in_month(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function week_start(day: string): string {
  const weekday = (new Date(utc(day)).getUTCDay() + 6) % 7;
  return add_days(day, -weekday);
}

export function add_months(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + index - 1 + by;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

export function month_grid(month: string): (string | null)[][] {
  const [year, index] = month.split("-").map(Number);
  const first = `${month}-01`;
  const lead = (new Date(utc(first)).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= days_in_month(year, index); day++) cells.push(`${month}-${pad2(day)}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export interface WeekPoint {
  start: string;
  mood: number | null;
  days: number;
}

export function week_series(days: ReadonlyMap<string, DayStat>, today: string, count: number): WeekPoint[] {
  const last = week_start(today);
  const points: WeekPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = add_days(last, -7 * i);
    const moods: number[] = [];
    for (let d = 0; d < 7; d++) {
      const mood = days.get(add_days(start, d))?.mood;
      if (mood !== null && mood !== undefined) moods.push(mood);
    }
    points.push({ start, mood: average(moods), days: moods.length });
  }
  return points;
}

export interface ActivityStat {
  id: string;
  days: number;
  mood: number;
  difference: number;
}

/**
 * Which activities go with better days: the average day mood with the activity against the average without it. Plain
 * averages, no statistics; an activity needs `min_days` days with a mood to be listed.
 */
export function activity_stats(days: Iterable<DayStat>, min_days = 2): ActivityStat[] {
  const rated = [...days].filter((day) => day.mood !== null);
  const ids = new Set(rated.flatMap((day) => [...day.activities]));
  const stats: ActivityStat[] = [];
  for (const id of ids) {
    const with_it = rated.filter((day) => day.activities.has(id)).map((day) => day.mood!);
    const without = rated.filter((day) => !day.activities.has(id)).map((day) => day.mood!);
    if (with_it.length < min_days) continue;
    const mood = average(with_it)!;
    stats.push({ id, days: with_it.length, mood, difference: without.length ? mood - average(without)! : 0 });
  }
  return stats.sort((a, b) => b.difference - a.difference || b.days - a.days);
}

export interface SplitStat {
  threshold: number;
  above: number | null;
  below: number | null;
  days: number;
}

/** Day mood on days at or above the median sleep (or energy) against days below it. `null` under four such days. */
export function split_stat(days: Iterable<DayStat>, field: "sleep" | "energy"): SplitStat | null {
  const rated = [...days].filter((day) => day.mood !== null && day[field] !== null);
  if (rated.length < 4) return null;
  const values = rated.map((day) => day[field]!).sort((a, b) => a - b);
  const threshold = values[Math.floor(values.length / 2)];
  const above = rated.filter((day) => day[field]! >= threshold).map((day) => day.mood!);
  const below = rated.filter((day) => day[field]! < threshold).map((day) => day.mood!);
  return { threshold, above: average(above), below: average(below), days: rated.length };
}

export interface Earlier<T> {
  label: string;
  date: string;
  entries: T[];
}

export function on_this_day<T extends { date: string }>(entries: readonly T[], today: string): Earlier<T>[] {
  const by_date = new Map<string, T[]>();
  for (const entry of entries) by_date.set(entry.date, [...(by_date.get(entry.date) ?? []), entry]);
  const [year, month, day] = today.split("-").map(Number);
  const out: Earlier<T>[] = [];
  const years = new Set(entries.map((entry) => Number(entry.date.slice(0, 4))).filter((y) => y < year));
  for (const y of [...years].sort((a, b) => b - a)) {
    const date = `${y}-${pad2(month)}-${pad2(day)}`;
    const found = by_date.get(date);
    if (found && day <= days_in_month(y, month))
      out.push({ label: year - y === 1 ? "A year ago" : `${year - y} years ago`, date, entries: found });
  }
  for (let back = 1; back <= 11; back++) {
    const target = add_months(today.slice(0, 7), -back);
    const [y, m] = target.split("-").map(Number);
    if (day > days_in_month(y, m)) continue;
    const date = `${target}-${pad2(day)}`;
    const found = by_date.get(date);
    if (found) out.push({ label: back === 1 ? "A month ago" : `${back} months ago`, date, entries: found });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1));
}
