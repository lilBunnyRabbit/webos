import { z } from "zod";
import { DAY, View } from "./props";
import { pad2 } from "$lib/core/utils";

export { CALENDAR_PROPS, View } from "./props";

/**
 * Calendar's data file, `/var/lib/apps/calendar/events.json`. Days are local `YYYY-MM-DD` and times local `HH:MM`, like
 * Work Hours, so an event stays at the same wall-clock time across DST and time zones.
 */
export const APP_ID = "calendar";
export const EVENTS_FILE = "events.json";
export const EVENTS_DIR = `/var/lib/apps/${APP_ID}`;
export const EVENTS_PATH = `${EVENTS_DIR}/${EVENTS_FILE}`;
export const CALENDAR_VERSION = 1;

export const EventColor = {
  PRIMARY: "primary",
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  ACCENT: "accent",
} as const;
export type EventColor = (typeof EventColor)[keyof typeof EventColor];
export const EVENT_COLORS = Object.values(EventColor);

export const Repeat = { DAILY: "daily", WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" } as const;
export type Repeat = (typeof Repeat)[keyof typeof Repeat];

const TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;

export const DaySchema = z.string().regex(DAY);
export const TimeSchema = z.string().regex(TIME);

export const RepeatRuleSchema = z.object({
  every: z.enum(Repeat),
  /** Inclusive. */
  until: DaySchema.nullable(),
});
export type RepeatRule = z.infer<typeof RepeatRuleSchema>;

export const EventSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  /** The first (or only) day. Monthly and yearly repeats keep its day of month, clamped to shorter months. */
  day: DaySchema,
  all_day: z.boolean(),
  /** Kept while `all_day`, so switching back restores them. An event never crosses midnight; `end` may be `24:00`. */
  start: TimeSchema,
  end: TimeSchema,
  repeat: RepeatRuleSchema.nullable(),
  skip: z.array(DaySchema),
  notes: z.string(),
  color: z.enum(EventColor),
  /** Minutes before the start; an all-day event counts from 09:00 on its day. `null`: no reminder. It fires as the scheduler job `calendar:reminder-{id}`. */
  reminder: z.number().int().min(0).nullable(),
});
export type CalendarEvent = z.infer<typeof EventSchema>;

export const EventsFileSchema = z.object({
  version: z.literal(CALENDAR_VERSION),
  events: z.array(EventSchema),
});
export type EventsFile = z.infer<typeof EventsFileSchema>;

export const EMPTY_EVENTS: EventsFile = { version: CALENDAR_VERSION, events: [] };

export const SourcesSchema = z.object({ work_hours: z.boolean(), kanban: z.boolean() });
export type Sources = z.infer<typeof SourcesSchema>;
export const DEFAULT_SOURCES: Sources = { work_hours: true, kanban: true };

export function parse_events(text: string): EventsFile | null {
  try {
    const result = EventsFileSchema.safeParse(JSON.parse(text));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export const new_id = (): string => crypto.randomUUID().slice(0, 8);

export function parts_of(day: string): [number, number, number] {
  const [year, month, date] = day.split("-").map(Number);
  return [year, month, date];
}

export function date_of(day: string): Date {
  const [year, month, date] = parts_of(day);
  return new Date(year, month - 1, date);
}

// Day arithmetic runs in UTC, where every day is 24 h, so DST never shifts a day.
function utc_day(day: string): number {
  const [year, month, date] = parts_of(day);
  return Date.UTC(year, month - 1, date) / 86_400_000;
}

function from_utc_day(index: number): string {
  const date = new Date(index * 86_400_000);
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

export function add_days(day: string, by: number): string {
  return from_utc_day(utc_day(day) + by);
}

export function days_between(from: string, to: string): number {
  return utc_day(to) - utc_day(from);
}

export function weekday_from_monday(day: string): number {
  return (((utc_day(day) + 3) % 7) + 7) % 7;
}

export function days_in_month(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function month_of(day: string): string {
  return day.slice(0, 7);
}

export function add_months(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number);
  const total = year * 12 + (index - 1) + by;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

export function clamp_day(month: string, date: number): string {
  const [year, index] = month.split("-").map(Number);
  return `${month}-${pad2(Math.min(date, days_in_month(year, index)))}`;
}

export function start_of_week(day: string): string {
  return add_days(day, -weekday_from_monday(day));
}

export function month_grid(month: string): string[][] {
  const first = `${month}-01`;
  const [year, index] = month.split("-").map(Number);
  const last = `${month}-${pad2(days_in_month(year, index))}`;
  const weeks: string[][] = [];
  for (let start = start_of_week(first); start <= last; start = add_days(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => add_days(start, i)));
  }
  return weeks;
}

export function range(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => add_days(from, i));
}

export function months_in(from: string, to: string): string[] {
  const months: string[] = [];
  for (let month = month_of(from); month <= month_of(to); month = add_months(month, 1)) months.push(month);
  return months;
}

export function minutes_of(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

export function time_of(minutes: number): string {
  return `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;
}

export function at(day: string, time: string): number {
  const [year, month, date] = parts_of(day);
  const minutes = minutes_of(time);
  return new Date(year, month - 1, date, Math.floor(minutes / 60), minutes % 60).getTime();
}

export function occurrences(event: Pick<CalendarEvent, "day" | "repeat" | "skip">, from: string, to: string): string[] {
  const last = event.repeat?.until && event.repeat.until < to ? event.repeat.until : to;
  const first = event.day > from ? event.day : from;
  if (first > last) return [];
  const skipped = new Set(event.skip);
  const days: string[] = [];
  const push = (day: string) => {
    if (day >= first && day <= last && day >= event.day && !skipped.has(day)) days.push(day);
  };

  if (!event.repeat) {
    push(event.day);
    return days;
  }

  const [, start_month, start_date] = parts_of(event.day);
  switch (event.repeat.every) {
    case Repeat.DAILY:
      for (let day = first; day <= last; day = add_days(day, 1)) push(day);
      break;
    case Repeat.WEEKLY: {
      const behind = days_between(event.day, first) % 7;
      for (let day = behind ? add_days(first, 7 - behind) : first; day <= last; day = add_days(day, 7)) push(day);
      break;
    }
    case Repeat.MONTHLY:
      for (let month = month_of(first); month <= month_of(last); month = add_months(month, 1))
        push(clamp_day(month, start_date));
      break;
    case Repeat.YEARLY: {
      for (let year = Number(first.slice(0, 4)); year <= Number(last.slice(0, 4)); year++) {
        push(clamp_day(`${year}-${pad2(start_month)}`, start_date));
      }
      break;
    }
  }
  return days;
}

export interface Occurrence {
  event: CalendarEvent;
  day: string;
  start: number;
  end: number;
}

export function occurrence(event: CalendarEvent, day: string): Occurrence {
  if (event.all_day) return { event, day, start: at(day, "00:00"), end: at(add_days(day, 1), "00:00") };
  return { event, day, start: at(day, event.start), end: at(day, event.end) };
}

export function compare_occurrences(a: Occurrence, b: Occurrence): number {
  return (
    a.day.localeCompare(b.day) ||
    Number(b.event.all_day) - Number(a.event.all_day) ||
    a.start - b.start ||
    a.end - b.end ||
    a.event.title.localeCompare(b.event.title)
  );
}

export function expand(events: CalendarEvent[], from: string, to: string): Occurrence[] {
  return events
    .flatMap((event) => occurrences(event, from, to).map((day) => occurrence(event, day)))
    .sort(compare_occurrences);
}

export function group_by_day<T extends { day: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const list = groups.get(item.day);
    if (list) list.push(item);
    else groups.set(item.day, [item]);
  }
  return groups;
}

export const ALL_DAY_REMINDER_BASE = "09:00";

export const REMINDER_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "No reminder" },
  { value: "0", label: "At the start" },
  { value: "5", label: "5 minutes before" },
  { value: "10", label: "10 minutes before" },
  { value: "15", label: "15 minutes before" },
  { value: "30", label: "30 minutes before" },
  { value: "60", label: "1 hour before" },
  { value: "120", label: "2 hours before" },
  { value: "1440", label: "1 day before" },
  { value: "10080", label: "1 week before" },
];

export function repeat_label(rule: RepeatRule | null, day: string): string {
  if (!rule) return "Does not repeat";
  const date = date_of(day);
  const base = {
    [Repeat.DAILY]: "Every day",
    [Repeat.WEEKLY]: `Every ${date.toLocaleDateString("en-US", { weekday: "long" })}`,
    [Repeat.MONTHLY]: `Monthly on day ${date.getDate()}`,
    [Repeat.YEARLY]: `Every year on ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
  }[rule.every];
  return rule.until ? `${base}, until ${format_day(rule.until)}` : base;
}

export function format_day(
  day: string,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }
): string {
  return date_of(day).toLocaleDateString("en-US", options);
}

export function day_title(day: string, today: string): string {
  const label = format_day(day, { weekday: "long", month: "short", day: "numeric" });
  if (day === today) return `Today · ${label}`;
  if (day === add_days(today, 1)) return `Tomorrow · ${label}`;
  if (day === add_days(today, -1)) return `Yesterday · ${label}`;
  return label;
}

export function month_title(month: string): string {
  return date_of(`${month}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export function span_title(days: string[]): string {
  const first = days[0];
  const last = days[days.length - 1];
  if (month_of(first) === month_of(last)) return month_title(month_of(first));
  const same_year = first.slice(0, 4) === last.slice(0, 4);
  const short = (day: string) => format_day(day, same_year ? { month: "short" } : { month: "short", year: "numeric" });
  return same_year ? `${short(first)} – ${short(last)} ${first.slice(0, 4)}` : `${short(first)} – ${short(last)}`;
}

export function time_label(event: Pick<CalendarEvent, "all_day" | "start" | "end">): string {
  return event.all_day ? "All day" : `${event.start}–${event.end}`;
}

export function until_label(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes === 0) return "now";
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 1440) return `in ${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
  const days = Math.round(minutes / 1440);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

export function step(view: View, anchor: string, direction: number, days = 7): string {
  if (view === View.MONTH) return clamp_day(add_months(month_of(anchor), direction), Number(anchor.slice(8)));
  if (view === View.WEEK) return add_days(anchor, direction * days);
  return add_days(anchor, direction * 30);
}

export function week_days(anchor: string, count: number): string[] {
  return range(count === 7 ? start_of_week(anchor) : anchor, count);
}

export interface TimedItem {
  start: number;
  end: number;
}

export interface Placed<T> {
  item: T;
  column: number;
  columns: number;
}

export function layout_timed<T extends TimedItem>(items: T[], min_length = 20): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let ends: number[] = [];
  let cluster_end = -Infinity;
  const close = () => {
    for (const entry of cluster) entry.columns = ends.length;
    cluster = [];
    ends = [];
  };
  for (const item of sorted) {
    const end = Math.max(item.end, item.start + min_length);
    if (item.start >= cluster_end) {
      close();
      cluster_end = -Infinity;
    }
    let column = ends.findIndex((value) => value <= item.start);
    if (column < 0) column = ends.push(end) - 1;
    else ends[column] = end;
    const entry = { item, column, columns: 1 };
    cluster.push(entry);
    placed.push(entry);
    cluster_end = Math.max(cluster_end, end);
  }
  close();
  return placed;
}

export interface EventDraft {
  id: string | null;
  title: string;
  day: string;
  all_day: boolean;
  start: string;
  end: string;
  repeat: Repeat | "none";
  until: string;
  notes: string;
  color: EventColor;
  reminder: string;
}

export function new_draft(day: string, now = new Date()): EventDraft {
  const hour = Math.min(22, now.getHours() + 1);
  return {
    id: null,
    title: "",
    day,
    all_day: false,
    start: time_of(hour * 60),
    end: time_of((hour + 1) * 60),
    repeat: "none",
    until: "",
    notes: "",
    color: EventColor.PRIMARY,
    reminder: "none",
  };
}

export function draft_of(event: CalendarEvent): EventDraft {
  return {
    id: event.id,
    title: event.title,
    day: event.day,
    all_day: event.all_day,
    start: event.start,
    end: event.end,
    repeat: event.repeat?.every ?? "none",
    until: event.repeat?.until ?? "",
    notes: event.notes,
    color: event.color,
    reminder: event.reminder === null ? "none" : String(event.reminder),
  };
}

export function draft_error(draft: EventDraft): string | null {
  if (!draft.title.trim()) return "Give the event a title";
  if (!DAY.test(draft.day)) return "Pick a day";
  if (!draft.all_day) {
    if (!TIME.test(draft.start) || !TIME.test(draft.end)) return "Enter a start and an end time";
    if (minutes_of(draft.end) <= minutes_of(draft.start)) return "The end must be after the start";
  }
  if (draft.repeat !== "none" && draft.until && (!DAY.test(draft.until) || draft.until < draft.day))
    return "The repeat must end after the first day";
  return null;
}

/** Edits keep `skip` only while the series keeps its first day and rule, since skipped days would no longer line up. */
export function event_from_draft(draft: EventDraft, previous: CalendarEvent | null): CalendarEvent {
  const reminder = draft.reminder === "none" ? null : Number(draft.reminder);
  const event: CalendarEvent = {
    id: previous?.id ?? new_id(),
    title: draft.title.trim(),
    day: draft.day,
    all_day: draft.all_day,
    start: draft.start,
    end: draft.end,
    repeat: draft.repeat === "none" ? null : { every: draft.repeat, until: draft.until || null },
    skip:
      previous &&
      previous.day === draft.day &&
      previous.repeat?.every === (draft.repeat === "none" ? undefined : draft.repeat)
        ? previous.skip
        : [],
    notes: draft.notes,
    color: draft.color,
    reminder,
  };
  return event;
}

export function skip_occurrence(event: CalendarEvent, day: string): CalendarEvent {
  return event.skip.includes(day) ? event : { ...event, skip: [...event.skip, day].sort() };
}
