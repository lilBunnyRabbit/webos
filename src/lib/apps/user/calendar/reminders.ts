import { JobKind, type Job, type JobInput, type JobRepeat } from "$lib/core/api/services/scheduler";
import { next_occurrence, pending } from "$lib/core/api/services/scheduler/occurrence";
import { format_date_key, local_date } from "$lib/core/utils/zoned";
import {
  add_days,
  ALL_DAY_REMINDER_BASE,
  APP_ID,
  minutes_of,
  parts_of,
  Repeat,
  time_label,
  until_label,
  weekday_from_monday,
  type CalendarEvent,
} from "./calendar";

export type ReminderTiming = Pick<CalendarEvent, "day" | "all_day" | "start" | "repeat" | "skip" | "reminder">;

export const reminder_key = (event_id: string): string => `reminder-${event_id}`;
export const reminder_job_id = (event_id: string): string => `${APP_ID}:${reminder_key(event_id)}`;

export function event_id_of(job_id: string): string | null {
  const prefix = `${APP_ID}:reminder-`;
  return job_id.startsWith(prefix) ? job_id.slice(prefix.length) : null;
}

const event_time = (event: Pick<CalendarEvent, "all_day" | "start">): string => (event.all_day ? ALL_DAY_REMINDER_BASE : event.start);

export function event_repeat(event: ReminderTiming): JobRepeat | undefined {
  if (!event.repeat) return undefined;
  const bounds: Pick<JobRepeat, "until" | "skip"> = {};
  if (event.repeat.until) bounds.until = event.repeat.until;
  if (event.skip.length > 0) bounds.skip = [...event.skip];
  switch (event.repeat.every) {
    case Repeat.DAILY:
      return { every: "day", ...bounds };
    case Repeat.WEEKLY:
      return { every: "week", days: [(weekday_from_monday(event.day) + 1) % 7], ...bounds };
    case Repeat.MONTHLY:
      return { every: "month", day: parts_of(event.day)[2], ...bounds };
    case Repeat.YEARLY:
      return { every: "year", ...bounds };
  }
}

/** Days from a reminder's day to its event's day. */
export function lead_days(event: Pick<CalendarEvent, "all_day" | "start" | "reminder">): number {
  const minutes = minutes_of(event_time(event)) - (event.reminder ?? 0);
  return minutes >= 0 ? 0 : Math.ceil(-minutes / 1440);
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

export function reminder_message(event: Pick<CalendarEvent, "all_day" | "start" | "end" | "reminder">): string {
  if (!event.all_day) return `${time_label(event)} · ${until_label((event.reminder ?? 0) * 60_000)}`;
  const days = lead_days(event);
  return `${time_label(event)} · ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`;
}

export function reminded_day(epoch: number, zone: string, days: number): string {
  return add_days(format_date_key(local_date(epoch, zone)), days);
}

/** `null` when the event has no reminder or none is left from `now` on. */
export function reminder_input(event: CalendarEvent, zone: string, now: number): JobInput | null {
  if (event.reminder === null) return null;
  const at = { date: event.day, time: event_time(event), tz: zone };
  const repeat = event_repeat(event);
  const before = event.reminder > 0 ? event.reminder : undefined;
  const next = next_occurrence({ at, repeat, before, armed: true }, now - 1);
  if (next === null) return null;
  const input: JobInput = {
    key: reminder_key(event.id),
    title: event.title,
    message: reminder_message(event),
    at,
    kind: JobKind.REMINDER,
    open: { app: APP_ID, props: { day: reminded_day(next, zone, lead_days(event)) } },
  };
  if (repeat) input.repeat = repeat;
  if (before) input.before = before;
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

/**
 * The zone is left out: an edit that keeps the wall time and rule keeps the job's zone. A job from before the lead
 * time (the reminder's own time, the rule shifted) never matches, so it's rescheduled in the event's form.
 */
export function same_timing(job: Pick<Job, "at" | "repeat" | "before">, input: Pick<JobInput, "at" | "repeat" | "before">): boolean {
  if ("epoch" in job.at || "epoch" in input.at) return false;
  return (
    job.at.date === input.at.date &&
    job.at.time === input.at.time &&
    (job.before ?? 0) === (input.before ?? 0) &&
    canonical(job.repeat) === canonical(input.repeat)
  );
}
