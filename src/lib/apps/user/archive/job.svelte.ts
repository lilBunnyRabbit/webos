import kernel, { NotificationType, type NotificationAction, type NotificationsService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { format_bytes } from "$lib/core/utils";
import { is_abort, type StreamOptions } from "./zip-format";

const UPDATE_MS = 150;
const SLICE_MS = 16;

export interface JobReport {
  title: string;
  message?: string;
  actions?: NotificationAction[];
}

export interface JobTexts {
  title: string;
  cancelled: string;
  failed: string;
}

export function error_message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Stands in for TasksService until it exists (ADR-035); Archive moves onto it then.
export class ArchiveJob {
  done = $state(0);
  readonly title: string;
  private readonly controller = new AbortController();
  private slice_start = performance.now();

  constructor(
    private readonly app_id: AppId,
    private readonly texts: JobTexts,
    readonly total: number
  ) {
    this.title = texts.title;
  }

  get fraction(): number {
    return this.total > 0 ? Math.min(1, this.done / this.total) : 0;
  }

  get message(): string {
    return `${format_bytes(this.done)} of ${format_bytes(this.total)}`;
  }

  cancel(): void {
    this.controller.abort(new DOMException("Cancelled", "AbortError"));
  }

  async run(work: (options: StreamOptions) => Promise<JobReport>): Promise<boolean> {
    const notifications = kernel.service<NotificationsService>("notifications");
    const id = notifications.notify(this.app_id, {
      type: NotificationType.PROGRESS,
      title: this.title,
      message: this.message,
      progress: 0,
      actions: [{ label: "Cancel", on_click: () => this.cancel() }],
    });

    let last_update = 0;
    const options: StreamOptions = {
      signal: this.controller.signal,
      on_bytes: (bytes) => {
        this.done += bytes;
        const now = performance.now();
        if (now - last_update < UPDATE_MS) return;
        last_update = now;
        notifications.update(id, { message: this.message, progress: this.fraction });
      },
      pace: async () => {
        if (performance.now() - this.slice_start < SLICE_MS) return;
        await new Promise((resolve) => setTimeout(resolve));
        this.slice_start = performance.now();
      },
    };

    try {
      const report = await work(options);
      notifications.update(id, { type: NotificationType.INFO, progress: null, message: undefined, actions: [], ...report });
      return true;
    } catch (error) {
      if (is_abort(error)) {
        notifications.update(id, { type: NotificationType.WARNING, title: this.texts.cancelled, message: undefined, progress: null, actions: [] });
      } else {
        console.error(`[${this.app_id}] ${this.texts.failed}`, error);
        notifications.update(id, { type: NotificationType.ERROR, title: this.texts.failed, message: error_message(error), progress: null, actions: [] });
      }
      return false;
    }
  }
}
