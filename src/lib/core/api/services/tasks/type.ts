import type { ExecutableTask, TaskManager } from "@lilbunnyrabbit/task-manager";
import type { IService } from "../../type";
import type { AppId } from "../apps/type";
import type { NotificationAction } from "../notifications/type";

export type TaskJobId = string;

export const TaskJobStatus = {
  RUNNING: "running",
  DONE: "done",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;
export type TaskJobStatus = (typeof TaskJobStatus)[keyof typeof TaskJobStatus];

/** What a job's work gets beside the package's own `this.setProgress()`. */
export interface TaskContext {
  /** Aborted by Cancel; a job that fails after it is cancelled, not failed. */
  readonly signal: AbortSignal;
  /** The line under the title: "3 of 10", "2 MB of 8 MB". */
  message(text: string | null): void;
  /** Yields to the browser when the current slice ran long, so a tight loop keeps the UI responsive. */
  pace(): Promise<void>;
}

export interface TaskReport {
  title?: string;
  message?: string;
  actions?: NotificationAction[];
}

export interface TaskRunOptions<T> {
  title: string;
  /** The finished toast. Default: the title, "done". */
  done?: (result: T) => TaskReport;
  /** The failed or cancelled toast, over the defaults. */
  failed?: (error: unknown, cancelled: boolean) => TaskReport;
  /** Another way to cancel, like the shell's Ctrl+C. */
  signal?: AbortSignal;
}

/** One run of a task or group in its own `TaskManager` (a manager runs once). Retry rebuilds it under the same id. */
export interface TaskJob<T = unknown> {
  readonly id: TaskJobId;
  readonly app_id: AppId;
  readonly title: string;
  readonly created_at: number;
  readonly finished_at: number | null;
  readonly status: TaskJobStatus;
  /** 0-1. */
  readonly progress: number;
  readonly message: string | null;
  /** Why it failed or stopped. */
  readonly error: string | null;
  /** The package's manager for the current run; `null` until the package's chunk has loaded. */
  readonly manager: TaskManager | null;
  /** The current run's result: the root task's, `null` when it failed or was cancelled. */
  readonly done: Promise<T | null>;
  cancel(): void;
}

/**
 * Background work with progress, Cancel and retry, on `@lilbunnyrabbit/task-manager` (ADR-013). Jobs outlive the
 * window that started them and live in memory only.
 */
export interface TasksService extends IService {
  /** Newest first. Capped at 50; running ones are kept past the cap. */
  readonly jobs: TaskJob[];
  readonly active_count: number;

  /**
   * Builds the task from `build` and runs it in a new manager, with a progress toast that turns into a done or failed
   * one. `build` runs again on retry, so it must make fresh tasks.
   */
  run<T>(app_id: AppId, build: (context: TaskContext) => ExecutableTask, options: TaskRunOptions<T>): TaskJob<T>;
  get(id: TaskJobId): TaskJob | undefined;
  cancel(id: TaskJobId): void;
  /** Runs a failed or cancelled job again. `false` when it can't. */
  retry(id: TaskJobId): boolean;
  /** Drops a finished job from the list. */
  remove(id: TaskJobId): void;
  /** Drops every finished job. */
  clear(): void;
}
