import kernel, { NotificationType, type NotificationAction, type NotificationsService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { error_message } from "./pdf-files";

export interface JobReport {
  title: string;
  message?: string;
  actions?: NotificationAction[];
}

export interface JobStep {
  (label?: string): Promise<void>;
}

const SLICE_MS = 16;

export async function run_job(app_id: AppId, title: string, total: number, work: (step: JobStep) => Promise<JobReport>): Promise<boolean> {
  const notifications = kernel.service<NotificationsService>("notifications");
  let cancelled = false;
  let done = 0;
  let slice = performance.now();
  const id = notifications.notify(app_id, {
    type: NotificationType.PROGRESS,
    title,
    message: `0 of ${total}`,
    progress: 0,
    actions: [{ label: "Cancel", on_click: () => (cancelled = true) }],
  });

  const step: JobStep = async (label) => {
    done++;
    notifications.update(id, { message: label ?? `${done} of ${total}`, progress: total ? Math.min(1, done / total) : -1 });
    if (performance.now() - slice > SLICE_MS) {
      await new Promise((resolve) => setTimeout(resolve));
      slice = performance.now();
    }
    if (cancelled) throw new DOMException("Cancelled", "AbortError");
  };

  try {
    const report = await work(step);
    notifications.update(id, { type: NotificationType.INFO, progress: null, message: undefined, actions: [], ...report });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      notifications.update(id, { type: NotificationType.WARNING, title: "Stopped", message: `${done} of ${total} done`, progress: null, actions: [] });
    } else {
      console.error(`[${app_id}] ${title}`, error);
      notifications.update(id, { type: NotificationType.ERROR, title: `${title} failed`, message: error_message(error), progress: null, actions: [] });
    }
    return false;
  }
}
