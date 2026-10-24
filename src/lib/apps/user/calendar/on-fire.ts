import kernel, { pending, type OnFire, type SchedulerService } from "$lib/core/api";
import { APP_ID } from "./calendar";
import { events_file } from "./jobs";
import { event_id_of, lead_days, reminded_day, reminder_input, same_timing } from "./reminders";

// A job's `open` is fixed, so after each reminder it's pointed at the next occurrence's day; a reminder with none
// left is dropped rather than kept disarmed. A job still in the pre-lead-time form is rewritten as the event itself.
const on_fire: OnFire = async (fired) => {
  const scheduler = kernel.service<SchedulerService>("scheduler");
  const job = scheduler.get(fired.id);
  const event_id = event_id_of(fired.id);
  if (!job || !event_id) return;
  const event = (await events_file.read()).events.find((entry) => entry.id === event_id);
  const next = pending(job);
  if (!event || event.reminder === null || next === null || "epoch" in job.at) {
    await scheduler.cancel(job.id);
    return;
  }
  const input = reminder_input(event, job.at.tz, Date.now());
  if (!input) {
    await scheduler.cancel(job.id);
    return;
  }
  if (!same_timing(job, input)) {
    await scheduler.schedule(APP_ID, input);
    return;
  }
  const day = reminded_day(next, job.at.tz, lead_days(event));
  if (job.open?.props?.day !== day) await scheduler.update(job.id, { open: { app: APP_ID, props: { day } } });
};

export default on_fire;
