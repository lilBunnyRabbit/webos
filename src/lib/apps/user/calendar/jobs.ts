import kernel, { NotificationType, type NotificationsService, type SchedulerService } from "$lib/core/api";
import { live_file } from "$lib/core/contexts/app";
import { error_message } from "$lib/core/utils";
import { local_zone } from "$lib/core/utils/zoned";
import { APP_ID, EMPTY_EVENTS, EVENTS_PATH, EventsFileSchema, type CalendarEvent } from "./calendar";
import { reminder_input, reminder_job_id, same_timing } from "./reminders";

const scheduler = () => kernel.service<SchedulerService>("scheduler");

export const events_file = live_file(EVENTS_PATH, EMPTY_EVENTS, EventsFileSchema);

export function attempt(title: string, work: Promise<unknown>): void {
  work.catch((reason) =>
    kernel.service<NotificationsService>("notifications").notify(APP_ID, { type: NotificationType.ERROR, title, message: error_message(reason) })
  );
}

export async function sync_reminder(event: CalendarEvent): Promise<void> {
  const id = reminder_job_id(event.id);
  const job = scheduler().get(id);
  const input = reminder_input(event, local_zone(), Date.now());
  if (!input) {
    if (job) await scheduler().cancel(id);
    return;
  }
  if (job && same_timing(job, input)) {
    if (job.title !== input.title || job.message !== input.message) await scheduler().update(id, { title: input.title, message: input.message });
    return;
  }
  await scheduler().schedule(APP_ID, input);
}

export async function cancel_reminder(event_id: string): Promise<void> {
  await scheduler().cancel(reminder_job_id(event_id));
}
