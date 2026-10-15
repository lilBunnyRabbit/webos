import kernel, { NotificationType, type NotificationAction, type NotificationsService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { error_message, format_bytes } from "$lib/core/utils";
import { is_abort, type StreamOptions } from "./format";

const UPDATE_MS = 150;
const SLICE_MS = 16;

export interface JobReport {
  title: string;
  message?: string;
  actions?: NotificationAction[];
}

export interface JobDone<T> extends JobReport {
  result: T;
}

export interface JobTexts {
  title: string;
  cancelled: string;
  failed: string;
}

export interface Leftover {
  path: string;
  discard: () => Promise<void>;
}

// Stands in for TasksService until it exists (ADR-035); Archive moves onto it then.
export class ArchiveJob {
  done = $state(0);
  readonly title: string;
  failure: string | null = null;
  private readonly controller = new AbortController();
  private slice_start = performance.now();
  private leftover: Leftover | null = null;

  constructor(
    private readonly app_id: AppId,
    private readonly texts: JobTexts,
    readonly total: number,
    signal?: AbortSignal
  ) {
    this.title = texts.title;
    signal?.addEventListener("abort", () => this.cancel(), { once: true });
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

  wrote(leftover: Leftover | null): void {
    this.leftover = leftover;
  }

  async run<T>(work: (options: StreamOptions) => Promise<JobDone<T>>): Promise<T | null> {
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
      const { result, ...report } = await work(options);
      notifications.update(id, { type: NotificationType.INFO, progress: null, message: undefined, actions: [], ...report });
      return result;
    } catch (error) {
      const aborted = is_abort(error);
      this.failure = aborted ? "cancelled" : error_message(error);
      if (!aborted) console.error(`[${this.app_id}] ${this.texts.failed}`, error);
      const leftover = this.leftover;
      const lines = [aborted ? null : this.failure, leftover ? `Already written: ${leftover.path}` : null].filter((line) => line !== null);
      notifications.update(id, {
        type: aborted ? NotificationType.WARNING : NotificationType.ERROR,
        title: aborted ? this.texts.cancelled : this.texts.failed,
        message: lines.join(" · ") || undefined,
        progress: null,
        actions: leftover
          ? [
              { label: "Discard", on_click: () => void this.discard(leftover) },
              { label: "Keep", on_click: () => {} },
            ]
          : [],
      });
      return null;
    }
  }

  private async discard(leftover: Leftover): Promise<void> {
    const notifications = kernel.service<NotificationsService>("notifications");
    try {
      await leftover.discard();
      notifications.notify(this.app_id, { title: "Discarded", message: leftover.path });
    } catch (error) {
      notifications.notify(this.app_id, { type: NotificationType.ERROR, title: "Couldn't discard", message: error_message(error) });
    }
  }
}
