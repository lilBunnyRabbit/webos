import type { IService } from "../../type";
import type { AppId } from "../apps/type";

/** `"{app}:{key}"`. */
export type JobId = string;

export const JobKind = {
  /** Stays on screen until dismissed (`requireInteraction`). */
  ALARM: "alarm",
  TIMER: "timer",
  REMINDER: "reminder",
  /** A timed phase ending, one step of a routine (a Pomodoro focus or break, an interval): a softer chime than a timer. */
  PHASE: "phase",
} as const;
export type JobKind = (typeof JobKind)[keyof typeof JobKind];

/** One-shot absolute instant, or a wall time in an IANA zone (`date` `YYYY-MM-DD`, `time` `HH:MM`). */
export type JobAt = { epoch: number } | { date: string; time: string; tz: string };

export type Repeat =
  | { every: "day"; interval?: number }
  /** `0` = Sunday. */
  | { every: "week"; days: number[] }
  /** Clamps to the month's last day: 31 fires on 30 April and 28 or 29 February. */
  | { every: "month"; day: number }
  /** On `at.date`'s month and day; 29 February fires on the 28th in other years. */
  | { every: "year" };

/** `until` is the last day it may fire on (inclusive), `skip` days it doesn't; both `YYYY-MM-DD` in the job's zone. */
export type JobRepeat = Repeat & { until?: string; skip?: string[] };

/** A button on the notification: a shell command line, run in a WebOS tab when clicked. */
export interface JobAction {
  label: string;
  command: string;
}

export interface JobOpen {
  app: AppId;
  props?: Record<string, unknown>;
}

export interface Job {
  id: JobId;
  app: AppId;
  title: string;
  message?: string;
  /** For a repeating job: the wall time of every occurrence, and `at.date` the first day the rule may fire on. */
  at: JobAt;
  repeat?: JobRepeat;
  /**
   * Lead time in whole minutes: every occurrence fires this much earlier, taken off the wall clock in `at.tz`, so a day
   * before 09:00 is 09:00 the day before across DST. `until` and `skip` still name the rule's own days; `armed_at`,
   * `last_fired`, `missed_at` and `next()` are the fire instants.
   */
  before?: number;
  armed: boolean;
  /** Fires at this instant once, ahead of the rule; cleared when it fires. */
  snooze_until?: number;
  /**
   * Set by the scheduler when the job is scheduled, re-timed or switched back on: occurrences before it never fire and
   * never count as missed. Absent counts from the start.
   */
  armed_at?: number;
  /** The last occurrence that fired. */
  last_fired?: number;
  /**
   * The latest occurrence the scheduler counted as missed. The owning app reads it and clears it (a Pomodoro phase
   * pauses and shows when it ended); clearing it on a repeating job doesn't bring the missed occurrences back.
   */
  missed_at?: number;
  /** At most 2: Chrome's limit. */
  actions?: JobAction[];
  /** What a click on the notification opens; the owning app when absent. */
  open?: JobOpen;
  kind: JobKind;
  /** No in-page chime when it fires; the OS notification still sounds as the system's settings say. */
  silent?: boolean;
}

/** What an app passes to `schedule()`: the id becomes `"{app}:{key}"`. */
export interface JobInput extends Omit<Job, "id" | "app" | "armed" | "armed_at" | "last_fired" | "missed_at"> {
  key: string;
  /** Defaults to `true`. */
  armed?: boolean;
}

/** `armed_at` and `last_fired` are the scheduler's; `missed_at` may only be cleared. */
export type JobPatch = Partial<Omit<Job, "id" | "app" | "armed_at" | "last_fired" | "missed_at">> & { missed_at?: undefined };

export const FireOutcome = { FIRED: "fired", MISSED: "missed" } as const;
export type FireOutcome = (typeof FireOutcome)[keyof typeof FireOutcome];

export interface JobFire {
  outcome: FireOutcome;
  due: number;
}

/** Called in the leader tab after the notification, with the job as the registry holds it after that pass. */
export type OnFire = (job: Job, fire: JobFire) => void | Promise<void>;

export interface MissedJob {
  id: JobId;
  app: AppId;
  title: string;
  kind: JobKind;
  /** The latest occurrence that was missed. */
  due: number;
}

/**
 * Fires scheduled notifications for every app while any WebOS tab lives (ADR-062). The registry in
 * `/var/lib/scheduler/jobs.json` is the only store; one tab per browser leads and keeps the timer.
 */
export interface SchedulerService extends IService {
  /** Every job, in the registry's order. Reactive; other tabs' writes arrive through a BroadcastChannel. */
  readonly jobs: Job[];
  /** This tab holds the `webos:scheduler` lock and fires. */
  readonly is_leader: boolean;
  /** `showTrigger` exists: due jobs also get a triggered notification that fires with every tab closed. */
  readonly triggers: boolean;
  /** Jobs this tab found missed, newest batch last. In memory only; the lasting record is each job's `missed_at`. */
  readonly missed: MissedJob[];
  /** When the leader last saw the wall clock drift from `performance.now()`: the device slept or the clock was set. */
  readonly last_jump: number | null;

  /**
   * Adds the job, or replaces the one with the same id, armed from now: an occurrence already past never fires. Call
   * `notifications.request_system()` in the same click first, so the OS notification may show.
   */
  schedule(app: AppId, job: JobInput): Promise<Job>;
  /** Merges `patch`; `null` when there's no such job. */
  update(id: JobId, patch: JobPatch): Promise<Job | null>;
  cancel(id: JobId): Promise<boolean>;
  get(id: JobId): Job | undefined;
  list(app?: AppId): Job[];
  /** When it fires next (overdue when it's in the past and about to fire), or `null` for never. */
  next(id: JobId): number | null;
}
