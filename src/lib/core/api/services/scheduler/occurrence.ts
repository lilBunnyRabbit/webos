import {
  add_days,
  compare_dates,
  day_of_week,
  days_between,
  days_in_month,
  format_date_key,
  local_date,
  parse_date,
  parse_plain_time,
  wall_to_epoch,
  type PlainDate,
} from "$lib/core/utils/zoned";
import type { Job, JobRepeat, MissedJob } from "./type";

/** Later than this past its time, an occurrence is reported as missed instead of firing (ADR-062). */
export const MISSED_AFTER = 2 * 60_000;

/** Candidate days one rule may step through before giving up: decades of a daily rule whose days are all skipped. */
const MAX_CANDIDATES = 20_000;

export type JobRule = Pick<Job, "at" | "repeat" | "armed" | "snooze_until">;

/**
 * The first instant strictly after `after` at which the job fires, in its own zone, or `null` for never. A disarmed
 * job never fires; a snooze fires ahead of the rule. A wall time that doesn't exist that day (DST gap) fires shifted
 * forward by the gap; one that happens twice (fall-back) fires at its first pass.
 */
export function next_occurrence(job: JobRule, after: number): number | null {
  if (!job.armed) return null;
  const regular = next_regular(job, after);
  if (job.snooze_until === undefined || job.snooze_until <= after) return regular;
  return regular === null ? job.snooze_until : Math.min(regular, job.snooze_until);
}

function next_regular(job: JobRule, after: number): number | null {
  const { at, repeat } = job;
  if ("epoch" in at) return at.epoch > after ? at.epoch : null;

  const start = parse_date(at.date);
  const time = parse_plain_time(at.time);
  if (!start || !time) return null;
  if (!repeat) {
    const epoch = wall_to_epoch(start, time, at.tz);
    return epoch > after ? epoch : null;
  }

  const until = repeat.until ? parse_date(repeat.until) : null;
  const skip = new Set(repeat.skip ?? []);
  // Two days back: a wall time shifted forward can land on the next local day, and the zone's date at `after` can
  // be ahead of the occurrence's own day around a date-line change.
  const from = after === -Infinity ? start : max_date(start, add_days(local_date(after, at.tz), -2));

  let count = 0;
  for (const date of candidates(repeat, start, from)) {
    if (++count > MAX_CANDIDATES) return null;
    if (until && compare_dates(date, until) > 0) return null;
    if (skip.has(format_date_key(date))) continue;
    const epoch = wall_to_epoch(date, time, at.tz);
    if (epoch > after) return epoch;
  }
  return null;
}

function max_date(a: PlainDate, b: PlainDate): PlainDate {
  return compare_dates(a, b) >= 0 ? a : b;
}

function* candidates(repeat: JobRepeat, start: PlainDate, from: PlainDate): Generator<PlainDate> {
  switch (repeat.every) {
    case "day": {
      const interval = repeat.interval ?? 1;
      let step = Math.max(0, Math.ceil(days_between(start, from) / interval));
      while (true) yield add_days(start, step++ * interval);
    }
    case "week": {
      if (repeat.days.length === 0) return;
      for (let date = from; ; date = add_days(date, 1)) {
        if (repeat.days.includes(day_of_week(date))) yield date;
      }
    }
    case "month": {
      for (let year = from.year, month = from.month; ; month === 12 ? (year++, (month = 1)) : month++) {
        const date = { year, month, day: Math.min(repeat.day, days_in_month(year, month)) };
        if (compare_dates(date, start) >= 0) yield date;
      }
    }
    case "year": {
      for (let year = from.year; ; year++) {
        const date = { year, month: start.month, day: Math.min(start.day, days_in_month(year, start.month)) };
        if (compare_dates(date, start) >= 0) yield date;
      }
    }
  }
}

/**
 * The occurrence waiting to fire, overdue when it's in the past: the first one at or after `armed_at` and after the
 * last that fired or was missed.
 */
export function pending(job: Job): number | null {
  const armed = job.armed_at === undefined ? -Infinity : job.armed_at - 1;
  return next_occurrence(job, Math.max(armed, job.last_fired ?? -Infinity, job.missed_at ?? -Infinity));
}

export interface FiredJob {
  job: Job;
  due: number;
}

export interface Plan {
  jobs: Job[];
  changed: boolean;
  fired: FiredJob[];
  missed: MissedJob[];
}

/**
 * What the leader does at `now`. An occurrence at most `MISSED_AFTER` late fires. A later one is missed: a repeating
 * job skips to its next occurrence with no backfill, unless one of its occurrences is itself within the grace, which
 * then fires. A one-shot is disarmed either way.
 */
export function plan(jobs: Job[], now: number): Plan {
  const result: Plan = { jobs: [], changed: false, fired: [], missed: [] };
  for (const job of jobs) {
    const due = pending(job);
    if (due === null || due > now) {
      result.jobs.push(job);
      continue;
    }
    result.changed = true;
    const on_time = now - due <= MISSED_AFTER ? due : job.repeat ? recent(job, now) : null;
    if (on_time !== null) {
      result.fired.push({ job, due: on_time });
      result.jobs.push(after_fire(job, on_time));
    } else {
      const missed = after_missed(job, due, now);
      result.missed.push({ id: job.id, app: job.app, title: job.title, kind: job.kind, due: missed.missed_at! });
      result.jobs.push(missed);
    }
  }
  return result;
}

function recent(job: Job, now: number): number | null {
  const occurrence = next_occurrence(job, now - MISSED_AFTER - 1);
  return occurrence !== null && occurrence <= now ? occurrence : null;
}

function after_fire(job: Job, due: number): Job {
  const next: Job = { ...job, last_fired: due };
  if (next.snooze_until !== undefined && next.snooze_until <= due) delete next.snooze_until;
  if (!next.repeat) next.armed = false;
  return next;
}

/** `missed_at` is the latest occurrence at or before `now`, so the rule carries on from the next one. */
function after_missed(job: Job, due: number, now: number): Job {
  const next: Job = { ...job };
  delete next.snooze_until;
  if (!next.repeat) {
    next.armed = false;
    next.missed_at = due;
    return next;
  }
  let latest = due;
  for (let count = 0; count < MAX_CANDIDATES; count++) {
    const following = next_occurrence(next, latest);
    if (following === null || following > now) break;
    latest = following;
  }
  next.missed_at = latest;
  return next;
}

export function next_due(jobs: Job[]): number | null {
  let earliest: number | null = null;
  for (const job of jobs) {
    const due = pending(job);
    if (due !== null && (earliest === null || due < earliest)) earliest = due;
  }
  return earliest;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function format_repeat(repeat: JobRepeat | undefined): string {
  if (!repeat) return "once";
  const until = repeat.until ? ` until ${repeat.until}` : "";
  switch (repeat.every) {
    case "day":
      return (repeat.interval && repeat.interval > 1 ? `every ${repeat.interval} days` : "daily") + until;
    case "week":
      return [...repeat.days].sort((a, b) => a - b).map((day) => WEEKDAYS[day]).join(", ") + until;
    case "month":
      return `monthly on day ${repeat.day}` + until;
    case "year":
      return "yearly" + until;
  }
}
