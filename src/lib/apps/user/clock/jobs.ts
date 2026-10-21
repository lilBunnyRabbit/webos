import kernel, { NotificationType, pending, type Job, type JobId, type JobPatch, type NotificationsService, type SchedulerService } from "$lib/core/api";
import { app_data_path, json_file, live_file, type JsonFile } from "$lib/core/contexts/app";
import { error_message } from "$lib/core/utils";
import { local_zone } from "$lib/core/utils/zoned";
import {
  alarm_input,
  alarm_job_id,
  APP_ID,
  ClockDataSchema,
  DATA_FILE,
  drop_orphans,
  EMPTY_CLOCK,
  new_id,
  next_wall,
  time_to_run,
  timer_input,
  timer_of,
  type AlarmSpec,
  type ClockData,
  type Timer,
} from "./clock";

export type ClockFile = Omit<JsonFile<ClockData>, "release">;

const scheduler = () => kernel.service<SchedulerService>("scheduler");

export function attempt(title: string, work: Promise<unknown>): void {
  work.catch((reason) =>
    kernel.service<NotificationsService>("notifications").notify(APP_ID, { type: NotificationType.ERROR, title, message: error_message(reason) })
  );
}

export function open_clock_file(): JsonFile<ClockData> {
  return json_file(app_data_path(APP_ID, DATA_FILE), EMPTY_CLOCK, ClockDataSchema);
}

export const clock_file = live_file(app_data_path(APP_ID, DATA_FILE), EMPTY_CLOCK, ClockDataSchema);

async function edit_extras(change: (data: ClockData) => void): Promise<ClockData> {
  return clock_file.edit((data) => {
    change(data);
    return data;
  });
}

export async function save_alarm(id: string | null, spec: AlarmSpec): Promise<string> {
  const key = id ?? new_id();
  const label = spec.label.trim();
  await scheduler().schedule(APP_ID, alarm_input(key, { ...spec, label }, Date.now(), local_zone()));
  await edit_extras((data) => {
    data.alarms[alarm_job_id(key)] = { label };
  });
  return key;
}

/** A one-off alarm switched back on rings the next time the clock reads its time, in its own zone. */
export async function switch_alarm(id: JobId, on: boolean): Promise<Job | null> {
  const job = scheduler().get(id);
  if (!job) return null;
  const patch: JobPatch = { armed: on, snooze_until: undefined };
  if (on && !job.repeat && !("epoch" in job.at)) patch.at = next_wall(job.at.time, Date.now(), job.at.tz);
  return scheduler().update(id, patch);
}

/** Arming it lets a one-off alarm that already rang ring again at the snooze, and only then. */
export function snooze_alarm(id: JobId, ms: number): Promise<Job | null> {
  return scheduler().update(id, { armed: true, snooze_until: Date.now() + ms });
}

export async function stop_alarm(id: JobId): Promise<Job | null> {
  const job = scheduler().get(id);
  if (!job) return null;
  const rest: Job = { ...job };
  delete rest.snooze_until;
  return scheduler().update(id, { snooze_until: undefined, armed: job.armed && pending(rest) !== null });
}

export async function delete_alarm(id: JobId): Promise<void> {
  await scheduler().cancel(id);
  await edit_extras((data) => drop_orphans(data, scheduler().jobs));
}

export async function add_timer(label: string, duration_ms: number): Promise<Timer> {
  const id = new_id();
  const job = await scheduler().schedule(APP_ID, timer_input(id, label.trim(), duration_ms, Date.now() + duration_ms));
  const extras = { label: label.trim(), duration_ms };
  await edit_extras((data) => {
    data.timers[job.id] = extras;
  });
  return timer_of(job, extras)!;
}

// Each change writes the job and the extras in the order that keeps the shown state right in between: an armed job
// reads as running whatever the extras say.

export async function run_timer(timer: Timer, ms = time_to_run(timer)): Promise<void> {
  await scheduler().update(timer.job, { at: { epoch: Date.now() + ms }, armed: true });
  await edit_extras((data) => {
    data.timers[timer.job] = { label: timer.label, duration_ms: timer.duration_ms };
  });
}

export function restart_timer(timer: Timer): Promise<void> {
  return run_timer(timer, timer.duration_ms);
}

async function stop_at(timer: Timer, left_ms: number): Promise<void> {
  await edit_extras((data) => {
    data.timers[timer.job] = { label: timer.label, duration_ms: timer.duration_ms, left_ms };
  });
  await scheduler().update(timer.job, { armed: false });
}

export function pause_timer(timer: Timer): Promise<void> {
  return stop_at(timer, timer.end_at === null ? timer.remaining_ms : Math.max(0, timer.end_at - Date.now()));
}

export function reset_timer(timer: Timer): Promise<void> {
  return stop_at(timer, timer.duration_ms);
}

export async function rename_timer(timer: Timer, label: string): Promise<void> {
  const name = label.trim();
  await edit_extras((data) => {
    data.timers[timer.job] = { ...(data.timers[timer.job] ?? { duration_ms: timer.duration_ms }), label: name };
  });
  await scheduler().update(timer.job, { title: timer_input(timer.id, name, timer.duration_ms, 0).title });
}

export async function remove_timer(timer: Timer): Promise<void> {
  await scheduler().cancel(timer.job);
  await edit_extras((data) => drop_orphans(data, scheduler().jobs));
}
