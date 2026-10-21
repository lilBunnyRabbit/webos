import { JobKind, type Job, type JobInput, type JobRepeat } from "$lib/core/api/services/scheduler";
import { next_occurrence, pending } from "$lib/core/api/services/scheduler/occurrence";
import { format_date_key, local_date } from "$lib/core/utils/zoned";
import {
  add_days,
  add_months,
  ALL_DAY_REMINDER_BASE,
  APP_ID,
  days_in_month,
  DaySchema,
  minutes_of,
  occurrences,
  parts_of,
  Repeat,
  time_label,
  time_of,
  TimeSchema,
  until_label,
  weekday_from_monday,
  type CalendarEvent,
  type EventDraft,
} from "./calendar";

export type ReminderTiming = Pick<CalendarEvent, "day" | "all_day" | "start" | "repeat" | "skip" | "reminder">;

export interface ReminderRule {
  date: string;
  time: string;
  /** Days from a reminder's day to its event's day. */
  shift: number;
  repeat?: JobRepeat;
}

export type ReminderPlan =
  | { kind: "none" }
  | { kind: "rule"; rule: ReminderRule }
  | { kind: "unsupported"; reason: string };

export const reminder_key = (event_id: string): string => `reminder-${event_id}`;
export const reminder_job_id = (event_id: string): string => `${APP_ID}:${reminder_key(event_id)}`;

export function event_id_of(job_id: string): string | null {
  const prefix = `${APP_ID}:reminder-`;
  return job_id.startsWith(prefix) ? job_id.slice(prefix.length) : null;
}

// Long enough to meet every month length after every other, leap years included.
const MONTHS_CHECKED = 48;
const YEARS_CHECKED = 8;

export function reminder_plan(event: ReminderTiming): ReminderPlan {
  if (event.reminder === null) return { kind: "none" };
  const total = minutes_of(event.all_day ? ALL_DAY_REMINDER_BASE : event.start) - event.reminder;
  const shift = total >= 0 ? 0 : Math.ceil(-total / 1440);
  const date = add_days(event.day, -shift);
  const time = time_of(total + shift * 1440);
  if (!event.repeat) return { kind: "rule", rule: { date, time, shift } };

  const lined_up: Pick<JobRepeat, "until" | "skip"> = {};
  if (event.repeat.until) lined_up.until = add_days(event.repeat.until, -shift);
  if (event.skip.length > 0) lined_up.skip = event.skip.map((day) => add_days(day, -shift));

  const rule = (repeat: JobRepeat): ReminderPlan => ({ kind: "rule", rule: { date, time, shift, repeat: { ...repeat, ...lined_up } } });
  switch (event.repeat.every) {
    case Repeat.DAILY:
      return rule({ every: "day" });
    case Repeat.WEEKLY:
      return rule({ every: "week", days: [(weekday_from_monday(date) + 1) % 7] });
    case Repeat.MONTHLY: {
      const [year, month, day] = parts_of(date);
      const candidates = day === days_in_month(year, month) && day < 31 ? [day, 31] : [day];
      const fits = candidates.find((candidate) => follows(event, date, shift, { every: "month", day: candidate }, MONTHS_CHECKED));
      if (fits !== undefined) return rule({ every: "month", day: fits });
      return { kind: "unsupported", reason: "This reminder can't follow a monthly repeat from this day yet; pick one on the event's day" };
    }
    case Repeat.YEARLY:
      if (follows(event, date, shift, { every: "year" }, YEARS_CHECKED)) return rule({ every: "year" });
      return { kind: "unsupported", reason: "This reminder can't follow a yearly repeat around 29 February yet; pick one on the event's day" };
  }
}

// Checked against the scheduler's own rule rather than reasoned about: month-end clamping and 29 February make a
// shifted monthly or yearly reminder land on a different day of the month in some months. UTC has no DST gap.
function follows(event: ReminderTiming, date: string, shift: number, repeat: JobRepeat, count: number): boolean {
  const span = repeat.every === "month" ? add_months(event.day.slice(0, 7), count) : `${Number(event.day.slice(0, 4)) + count}-12`;
  const rule = event.repeat && { ...event.repeat, until: null };
  const expected = occurrences({ day: event.day, repeat: rule, skip: [] }, event.day, `${span}-01`).map((day) => add_days(day, -shift));
  const job = { at: { date, time: "12:00", tz: "UTC" }, repeat, armed: true };
  let after = -Infinity;
  for (const day of expected) {
    const next = next_occurrence(job, after);
    if (next === null || format_date_key(local_date(next, "UTC")) !== day) return false;
    after = next;
  }
  return true;
}

export function reminder_error(draft: EventDraft): string | null {
  if (!DaySchema.safeParse(draft.day).success || (!draft.all_day && !TimeSchema.safeParse(draft.start).success)) return null;
  const plan = reminder_plan({
    day: draft.day,
    all_day: draft.all_day,
    start: draft.start,
    repeat: draft.repeat === "none" ? null : { every: draft.repeat, until: draft.until || null },
    skip: [],
    reminder: draft.reminder === "none" ? null : Number(draft.reminder),
  });
  return plan.kind === "unsupported" ? plan.reason : null;
}

export interface UpcomingReminder {
  job: Job;
  at: number;
}

export function next_reminder(jobs: Job[], now: number): UpcomingReminder | null {
  let best: UpcomingReminder | null = null;
  for (const job of jobs) {
    const at = pending(job);
    if (at !== null && at > now && (!best || at < best.at)) best = { job, at };
  }
  return best;
}

export function reminder_message(event: Pick<CalendarEvent, "all_day" | "start" | "end" | "reminder">, shift: number): string {
  if (!event.all_day) return `${time_label(event)} · ${until_label((event.reminder ?? 0) * 60_000)}`;
  return `${time_label(event)} · ${shift === 0 ? "today" : shift === 1 ? "tomorrow" : `in ${shift} days`}`;
}

export function reminded_day(epoch: number, zone: string, shift: number): string {
  return add_days(format_date_key(local_date(epoch, zone)), shift);
}

/** `null` when the event has no reminder, the scheduler can't follow it, or none is left from `now` on. */
export function reminder_input(event: CalendarEvent, zone: string, now: number): JobInput | null {
  const plan = reminder_plan(event);
  if (plan.kind !== "rule") return null;
  const { date, time, shift, repeat } = plan.rule;
  const at = { date, time, tz: zone };
  const next = next_occurrence({ at, repeat, armed: true }, now - 1);
  if (next === null) return null;
  const input: JobInput = {
    key: reminder_key(event.id),
    title: event.title,
    message: reminder_message(event, shift),
    at,
    kind: JobKind.REMINDER,
    open: { app: APP_ID, props: { day: reminded_day(next, zone, shift) } },
  };
  if (repeat) input.repeat = repeat;
  return input;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value).filter(([, entry]) => entry !== undefined);
    return `{${entries
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${key}:${canonical(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** The zone is left out: an edit that keeps the wall time and rule keeps the job's zone. */
export function same_timing(job: Pick<Job, "at" | "repeat">, input: Pick<JobInput, "at" | "repeat">): boolean {
  if ("epoch" in job.at || "epoch" in input.at) return false;
  return job.at.date === input.at.date && job.at.time === input.at.time && canonical(job.repeat) === canonical(input.repeat);
}
