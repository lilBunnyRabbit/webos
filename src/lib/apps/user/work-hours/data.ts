import { z } from "zod";
import { pad2 } from "$lib/core/utils";
import { day_key } from "$lib/core/utils/date";

/**
 * Work Hours' file format. A contract: Calendar reads these files, so change it only with a new `version` and a
 * migration.
 *
 * - `/var/lib/apps/work-hours/YYYY-MM.json`: one month (`MonthFile`). A missing file is an empty month.
 * - `/var/lib/apps/work-hours/state.json`: the running session (`StateFile`).
 *
 * Times are local wall-clock `HH:MM` on a local `YYYY-MM-DD` day, so a month reads the same in any time zone. An
 * entry never crosses midnight: a session that does is split, and its first part ends at `24:00`.
 */

export const WORK_HOURS_APP_ID = "work-hours";
export const WORK_HOURS_DIR = `/var/lib/apps/${WORK_HOURS_APP_ID}`;
export const WORK_HOURS_VERSION = 1;
export const STATE_FILE = "state.json";

const TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const DAY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/;
const MONTH = /^\d{4}-(?:0[1-9]|1[0-2])$/;

export const TimeSchema = z.string().regex(TIME);
export const DayKeySchema = z.string().regex(DAY);
export const MonthKeySchema = z.string().regex(MONTH);

/** One block of work. An `end` at or before `start` counts as zero; the app never writes one. */
export const EntrySchema = z.object({
  id: z.string().min(1),
  start: TimeSchema,
  end: TimeSchema,
  description: z.string(),
});
export type Entry = z.infer<typeof EntrySchema>;

export const DaySchema = z.object({
  entries: z.array(EntrySchema),
  note: z.string(),
});
export type Day = z.infer<typeof DaySchema>;

export const MonthFileSchema = z.object({
  version: z.literal(WORK_HOURS_VERSION),
  month: MonthKeySchema,
  target_hours: z.number().min(0).nullable(),
  /** Only days with entries or a note. Keys belong to `month`. */
  days: z.record(DayKeySchema, DaySchema),
});
export type MonthFile = z.infer<typeof MonthFileSchema>;

export const RunningSchema = z.object({
  start: z.iso.datetime({ offset: true }),
  description: z.string(),
});
export type Running = z.infer<typeof RunningSchema>;

export const StateFileSchema = z.object({
  version: z.literal(WORK_HOURS_VERSION),
  /** The open session, or `null` when clocked out. At most one. */
  running: RunningSchema.nullable(),
});
export type StateFile = z.infer<typeof StateFileSchema>;

export const EMPTY_STATE: StateFile = { version: WORK_HOURS_VERSION, running: null };

export function empty_month(month: string): MonthFile {
  return { version: WORK_HOURS_VERSION, month, target_hours: null, days: {} };
}

export const EMPTY_DAY: Day = { entries: [], note: "" };

export function month_file_name(month: string): string {
  return `${month}.json`;
}

export function month_file_path(month: string): string {
  return `${WORK_HOURS_DIR}/${month_file_name(month)}`;
}

export function parse_month_file(text: string): MonthFile | null {
  try {
    const result = MonthFileSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parse_state_file(text: string): StateFile | null {
  try {
    const result = StateFileSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function serialize(file: MonthFile | StateFile): string {
  return JSON.stringify(file, null, 2) + "\n";
}

export function month_key(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

export function month_of(day: string): string {
  return day.slice(0, 7);
}

export function date_of(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
}

export function shift_month(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  return month_key(new Date(year, index - 1 + by, 1));
}

export function days_in_month(month: string): number {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index, 0).getDate();
}

export function month_days(month: string): string[] {
  return Array.from({ length: days_in_month(month) }, (_, i) => `${month}-${pad2(i + 1)}`);
}

export function is_weekend(day: string): boolean {
  const weekday = date_of(day).getDay();
  return weekday === 0 || weekday === 6;
}

export function iso_week(day: string): number {
  const date = date_of(day);
  const thursday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const first_thursday = new Date(thursday.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((thursday.getTime() - first_thursday.getTime()) / 86_400_000 - 3 + ((first_thursday.getDay() + 6) % 7)) / 7
    )
  );
}

export interface CalendarWeek {
  week: number;
  days: (string | null)[];
}

export function calendar_weeks(month: string): CalendarWeek[] {
  const days = month_days(month);
  const lead = (date_of(days[0]).getDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: CalendarWeek[] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const row = cells.slice(i, i + 7);
    weeks.push({ week: iso_week(row.find((day) => day !== null)!), days: row });
  }
  return weeks;
}

export function minutes_of(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function time_of(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

/** Whole minutes, like a clock shows them, so "Clocked in at" matches the taskbar. */
export function clock_time(date: Date): string {
  return time_of(date.getHours() * 60 + date.getMinutes());
}

export function entry_minutes(entry: Pick<Entry, "start" | "end">): number {
  return Math.max(0, minutes_of(entry.end) - minutes_of(entry.start));
}

export function day_minutes(day: Day | undefined): number {
  return day ? day.entries.reduce((total, entry) => total + entry_minutes(entry), 0) : 0;
}

export function month_minutes(file: MonthFile): number {
  return Object.values(file.days).reduce((total, day) => total + day_minutes(day), 0);
}

export function week_minutes(file: MonthFile): { week: number; minutes: number }[] {
  return calendar_weeks(file.month).map(({ week, days }) => ({
    week,
    minutes: days.reduce((total, day) => total + (day ? day_minutes(file.days[day]) : 0), 0),
  }));
}

export function worked_days(file: MonthFile): number {
  return Object.values(file.days).filter((day) => day_minutes(day) > 0).length;
}

export function day_span(day: Day | undefined): { start: string; end: string } | null {
  if (!day?.entries.length) return null;
  const starts = day.entries.map((entry) => minutes_of(entry.start));
  const ends = day.entries.map((entry) => minutes_of(entry.end));
  return { start: time_of(Math.min(...starts)), end: time_of(Math.max(...ends)) };
}

export function sorted_entries(day: Day | undefined): Entry[] {
  return [...(day?.entries ?? [])].sort(
    (a, b) => minutes_of(a.start) - minutes_of(b.start) || minutes_of(a.end) - minutes_of(b.end)
  );
}

export function format_hours(minutes: number): string {
  const safe = Math.max(0, Math.floor(minutes));
  return `${Math.floor(safe / 60)}:${pad2(safe % 60)}`;
}

export function running_minutes(running: Running | null, now: Date): number {
  if (!running) return 0;
  return Math.max(0, (now.getTime() - new Date(running.start).getTime()) / 60_000);
}

export interface Segment {
  day: string;
  start: string;
  end: string;
}

/** A session cut at local midnights into one segment per day. Segments shorter than a minute are dropped. */
export function split_session(start: Date, end: Date): Segment[] {
  const segments: Segment[] = [];
  let cursor = start;
  while (cursor < end) {
    const midnight = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
    const until = end < midnight ? end : midnight;
    const segment = {
      day: day_key(cursor),
      start: clock_time(cursor),
      end: until === midnight ? "24:00" : clock_time(until),
    };
    if (minutes_of(segment.end) > minutes_of(segment.start)) segments.push(segment);
    cursor = until;
  }
  return segments;
}

export function new_entry_id(): string {
  return crypto.randomUUID().slice(0, 8);
}

function assert_in_month(file: MonthFile, day: string): void {
  if (month_of(day) !== file.month) throw new Error(`${day} isn't in ${file.month}`);
}

/** Drops a day that has nothing left in it, so the file only lists days that matter. */
function with_day(file: MonthFile, day: string, next: Day): MonthFile {
  const days = { ...file.days };
  if (next.entries.length || next.note) days[day] = next;
  else delete days[day];
  return { ...file, days };
}

export function add_entry(file: MonthFile, day: string, entry: Entry): MonthFile {
  assert_in_month(file, day);
  const current = file.days[day] ?? EMPTY_DAY;
  return with_day(file, day, { ...current, entries: [...current.entries, entry] });
}

export function update_entry(file: MonthFile, day: string, entry: Entry): MonthFile {
  assert_in_month(file, day);
  const current = file.days[day] ?? EMPTY_DAY;
  return with_day(file, day, {
    ...current,
    entries: current.entries.map((item) => (item.id === entry.id ? entry : item)),
  });
}

export function remove_entry(file: MonthFile, day: string, id: string): MonthFile {
  const current = file.days[day];
  if (!current) return file;
  return with_day(file, day, { ...current, entries: current.entries.filter((item) => item.id !== id) });
}

export function set_note(file: MonthFile, day: string, note: string): MonthFile {
  assert_in_month(file, day);
  return with_day(file, day, { ...(file.days[day] ?? EMPTY_DAY), note });
}

export function set_target(file: MonthFile, hours: number | null): MonthFile {
  return { ...file, target_hours: hours };
}

export function entry_error(start: string, end: string): string | null {
  if (!TIME.test(start) || !TIME.test(end)) return "Enter a start and an end time";
  if (minutes_of(end) <= minutes_of(start)) return "The end must be after the start";
  return null;
}

export function parse_target(text: string): number | null | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (!trimmed) return null;
  const hours = Number(trimmed);
  return Number.isFinite(hours) && hours >= 0 && hours <= 744 ? hours : undefined;
}
