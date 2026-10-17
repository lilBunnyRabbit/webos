import type { ExecutableTask, TaskManager } from "@lilbunnyrabbit/task-manager";
import { error_message } from "$lib/core/utils";
import type { AppId } from "../apps/type";
import {
  NotificationType,
  type NotificationAction,
  type NotificationId,
  type NotificationsService,
} from "../notifications/type";
import { TaskJobStatus, type TaskContext, type TaskJob, type TaskRunOptions } from "./type";

const UPDATE_MS = 150;
const SLICE_MS = 16;

// The package stays out of the boot chunk until the first job runs.
const package_module = () => import("@lilbunnyrabbit/task-manager");

function cause(module: Awaited<ReturnType<typeof package_module>>, error: unknown): unknown {
  while (true) {
    if (module.isTaskError(error)) error = error.error;
    else if (module.isTasksError(error) && error.errors.length > 0) error = error.errors[0];
    else return error;
  }
}

export class Job<T> implements TaskJob<T> {
  readonly id = crypto.randomUUID();
  readonly title: string;
  readonly created_at = Date.now();
  finished_at = $state<number | null>(null);
  status = $state<TaskJobStatus>(TaskJobStatus.RUNNING);
  progress = $state(0);
  message = $state<string | null>(null);
  error = $state<string | null>(null);
  manager = $state.raw<TaskManager | null>(null);
  done: Promise<T | null> = Promise.resolve(null);

  private controller = new AbortController();
  private toast: NotificationId | null = null;
  private last_update = 0;
  private latest_progress = 0;
  private trailing: ReturnType<typeof setTimeout> | null = null;
  private slice_start = 0;

  constructor(
    readonly app_id: AppId,
    private readonly build: (context: TaskContext) => ExecutableTask,
    private readonly options: TaskRunOptions<T>,
    private readonly notifications: NotificationsService
  ) {
    this.title = options.title;
    options.signal?.addEventListener("abort", () => this.cancel(), { once: true });
  }

  get finished(): boolean {
    return this.status !== TaskJobStatus.RUNNING;
  }

  start(): void {
    this.controller = new AbortController();
    this.status = TaskJobStatus.RUNNING;
    this.progress = 0;
    this.latest_progress = 0;
    this.message = null;
    this.error = null;
    this.finished_at = null;
    this.manager = null;
    this.slice_start = performance.now();

    if (this.toast) this.notifications.dismiss(this.toast);
    this.toast = this.notifications.notify(this.app_id, {
      type: NotificationType.PROGRESS,
      title: this.title,
      progress: 0,
      actions: [{ label: "Cancel", on_click: () => this.cancel() }],
    });

    const context: TaskContext = {
      signal: this.controller.signal,
      message: (text) => {
        this.message = text;
        this.report();
      },
      pace: () => this.pace(),
    };

    let root: ExecutableTask;
    try {
      root = this.build(context);
    } catch (error) {
      this.done = Promise.resolve(this.fail(error));
      return;
    }

    this.done = this.launch(root).catch((error) => this.fail(error));
  }

  private async launch(root: ExecutableTask): Promise<T | null> {
    const module = await package_module();
    const manager = new module.TaskManager();
    let failure: unknown = null;
    manager.on("progress", (progress) => {
      this.latest_progress = progress;
      this.report();
    });
    manager.on("fail", (error) => {
      failure = cause(module, error);
    });
    this.manager = manager.addTask(root);

    await manager.start();
    if (manager.status !== "success") return this.fail(failure);
    return this.succeed(root instanceof module.Task ? (root.result.get() as T) : (undefined as T));
  }

  cancel(): void {
    if (this.finished) return;
    this.controller.abort(new DOMException("Cancelled", "AbortError"));
    if (this.manager?.isStatus("in-progress")) this.manager.stop();
  }

  private report(): void {
    const wait = this.last_update + UPDATE_MS - performance.now();
    if (wait > 0) {
      // The last update inside a gated window would otherwise be lost while a long step runs.
      this.trailing ??= setTimeout(() => {
        this.trailing = null;
        this.report();
      }, wait);
      return;
    }
    this.last_update = performance.now();
    this.progress = this.latest_progress;
    if (this.toast !== null) this.notifications.update(this.toast, { message: this.message ?? undefined, progress: this.progress });
  }

  private async pace(): Promise<void> {
    if (performance.now() - this.slice_start < SLICE_MS) return;
    await new Promise((resolve) => setTimeout(resolve));
    this.slice_start = performance.now();
  }

  private stop_reporting(): void {
    if (this.trailing !== null) clearTimeout(this.trailing);
    this.trailing = null;
  }

  private succeed(result: T): T {
    this.stop_reporting();
    this.finished_at = Date.now();
    this.progress = 1;
    this.status = TaskJobStatus.DONE;
    const report = this.options.done?.(result) ?? { message: "Done" };
    this.settle(NotificationType.INFO, { ...report, title: report.title ?? this.title });
    return result;
  }

  private fail(error: unknown): null {
    this.stop_reporting();
    const cancelled = this.controller.signal.aborted;
    this.finished_at = Date.now();
    this.progress = this.latest_progress;
    this.status = cancelled ? TaskJobStatus.CANCELLED : TaskJobStatus.FAILED;
    this.error = cancelled ? "cancelled" : error_message(error);
    if (!cancelled) console.error(`[${this.app_id}] ${this.title}`, error);
    const report = this.options.failed?.(error, cancelled) ?? {};
    this.settle(cancelled ? NotificationType.WARNING : NotificationType.ERROR, {
      title: report.title ?? (cancelled ? "Cancelled" : `${this.title} failed`),
      message: report.message ?? (cancelled ? this.title : this.error),
      actions: report.actions,
    });
    return null;
  }

  private settle(
    type: NotificationType,
    report: { title: string; message?: string; actions?: NotificationAction[] }
  ): void {
    if (this.toast === null) return;
    this.notifications.update(this.toast, { type, progress: null, actions: [], ...report });
  }
}
