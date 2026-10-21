import kernel, { pending, type OnFire, type SchedulerService } from "$lib/core/api";
import { APP_ID } from "./calendar";
import { events_file } from "./jobs";
import { event_id_of, reminded_day, reminder_plan } from "./reminders";

// A job's `open` is fixed, so after each reminder it's pointed at the next occurrence's day; a reminder with none
// left is dropped rather than kept disarmed.
const on_fire: OnFire = async (fired) => {
  const scheduler = kernel.service<SchedulerService>("scheduler");
  const job = scheduler.get(fired.id);
  const event_id = event_id_of(fired.id);
  if (!job || !event_id) return;
  const event = (await events_file.read()).events.find((entry) => entry.id === event_id);
  const plan = event ? reminder_plan(event) : null;
  const next = pending(job);
  if (plan?.kind !== "rule" || next === null || "epoch" in job.at) {
    await scheduler.cancel(job.id);
    return;
  }
  const day = reminded_day(next, job.at.tz, plan.rule.shift);
  if (job.open?.props?.day !== day) await scheduler.update(job.id, { open: { app: APP_ID, props: { day } } });
};

export default on_fire;
