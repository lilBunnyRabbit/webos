# ADR-013: Tasks Service & Task Manager App

**Date:** 2026-02-01
**Status:** Accepted

> **Revision 2026-10-15: unparked** (owner, [brainstorm](../brainstorm/2026-10-15_tasks-service.md)). It's built on task-manager **1.0.1** as is. A 2.0 adding cancel, retry and messages to the package was built and then dropped unpublished. WebOS keeps what the package lacks in its job mirror:
> - **Cancel:** an `AbortController` per job, which `job.cancel()` aborts before calling `manager.stop()`.
> - **Cancelled:** a failure with an AbortError shows as cancelled.
> - **Message:** `ctx.message()` sets it.
> - **Retry:** rebuilds the task from its builder in a fresh manager.
>
> This replaces the `TaskHandle` and `TaskOptions` below.
> - `run(app_id, (ctx) => task, { title, done, failed })` makes one `TaskManager` per job and returns a `TaskJob`: a `$state` mirror (status, progress, message) plus `manager` and a `done` promise.
> - Each job gets an automatic progress toast with Cancel.
> - It shows in a Tasks tab in Activity Monitor and in a tray indicator; on mobile, in the notification center.
> - Jobs live in memory only, capped at 50.
> - Shell: `task list`, `task cancel`, `task retry`, `task clear`.
> - First consumers are Archive and PDF Tools, replacing `ArchiveJob` and `run_job`.

> **Revision 2026-10-15: shortcut and zip.** Ctrl+Shift+Esc below is out: it's Windows' Task Manager ([ADR-017](./017-keyboard-shortcuts-strategy.md) revision). A Tasks shortcut takes an Alt+Shift binding, picked when it's built. Zip in File Explorer shipped without TasksService: Compress and Extract here run on the zip job in `core/utils/zip/job.svelte.ts` (progress toast, Cancel), which stands in until Tasks exists ([ADR-035](./035-app-platform-wave-2.md)).

> **Revision 2026-10-12: parked** (owner, [brainstorm](../brainstorm/2026-10-12_tasks-parked.md)). Nothing in the system needs it yet. It gets built with its first real consumer (the terminal, or zip in File Explorer). Before building: check `TaskHandle` against the package's actual API, and add an `AbortSignal` to `execute` so Cancel can stop the work.

> **Revision 2026-10-11:** No separate Task Manager app. The Activity Monitor system app (Windows, Performance, Network, Storage) gets a Tasks tab when TasksService lands ([brainstorm](../brainstorm/2026-10-11_app-ports.md)).

## Context

WebOS needs background task orchestration for long-running operations: file uploads, video processing, compression, batch operations. The `@lilbunnyrabbit/task-manager` npm package (your own package) provides task lifecycle, progress tracking, retry logic, and composable workflows. Integrating it into WebOS both solves a real need and serves as a showcase for the package.

### Related ADRs

- **ADR-006** (Notifications) — Task completion/failure triggers notifications
- **ADR-009** (App Ecosystem) — Multiple apps use Tasks Service for heavy operations

## Decision

### Tasks Service — Kernel Service

Registered as `"tasks"` in the kernel. Wraps `@lilbunnyrabbit/task-manager` and provides a reactive Svelte interface.

```typescript
class TasksService {
  /** Create and start a task */
  create(options: TaskOptions): TaskHandle;

  /** Create a group of tasks */
  create_group(options: GroupOptions): TaskGroupHandle;

  /** Get a task by ID */
  get(id: string): TaskHandle | undefined;

  /** All tasks (reactive) */
  readonly all: TaskHandle[];

  /** Active tasks (reactive) */
  readonly active: TaskHandle[];

  /** Count of running tasks (for taskbar badge) */
  readonly active_count: number;

  /** Cancel a task */
  cancel(id: string): void;

  /** Retry a failed task */
  retry(id: string): void;

  /** Remove a completed/failed/cancelled task from history */
  remove(id: string): void;

  /** Clear all completed tasks */
  clear_completed(): void;
}
```

### Task Handle

```typescript
interface TaskHandle {
  readonly id: string;
  readonly name: string;
  readonly status: "pending" | "running" | "completed" | "failed" | "cancelled";
  readonly progress: number | null;    // 0-1 for determinate, null for indeterminate
  readonly message: string | null;     // current status message
  readonly error: Error | null;
  readonly created_at: Date;
  readonly started_at: Date | null;
  readonly completed_at: Date | null;
  readonly app_id: string;            // which app created this task
}
```

### Integration Points

**File operations:**
```typescript
// Large file upload with progress
const handle = tasks.create({
  name: `Upload ${file.name}`,
  app_id: "file-explorer",
  execute: async (progress) => {
    await upload_file(file, (percent) => progress.update({ progress: percent }));
  },
});
```

**Notifications integration:**
When a task completes or fails, Tasks Service sends a notification via NotificationsService:
```typescript
notifications.notify(task.app_id, {
  title: task.status === "completed" ? `${task.name} complete` : `${task.name} failed`,
  type: task.status === "completed" ? "info" : "error",
});
```

**Taskbar badge:**
When `active_count > 0`, the taskbar shows a badge/indicator. Clicking opens Task Manager app.

### Task Manager App

System app providing a visual interface for all tasks.

- List all tasks with status, progress, elapsed time
- Filter by status (running, completed, failed, cancelled)
- Cancel, retry, remove actions per task
- Progress bars for active tasks
- Keyboard shortcut: Ctrl+Shift+Esc
- Single-instance app

### Retry Configuration

```typescript
interface TaskOptions {
  name: string;
  app_id: string;
  execute: (progress: ProgressReporter) => Promise<void>;
  retry?: {
    max_attempts: number;
    backoff: "fixed" | "exponential";
    delay_ms: number;
  };
}
```

## Alternatives Considered

1. **No centralized task system** — each app manages its own async ops. Rejected — no unified progress view, no retry logic reuse, no taskbar integration.
2. **Custom implementation without task-manager package** — Rejected. The package already solves this and showcasing it is valuable.
3. **Web Workers for all tasks** — Workers Service can complement this for CPU-heavy tasks, but Tasks Service handles the lifecycle/progress layer regardless of where execution happens.

## Consequences

### Positive
- Unified background task management across all apps
- Progress tracking and retry logic built-in
- Showcase for `@lilbunnyrabbit/task-manager` package
- Taskbar integration provides visibility
- Notification integration keeps users informed

### Negative
- Adds `@lilbunnyrabbit/task-manager` as dependency
- Task Manager app needs to handle potentially many tasks efficiently
- Memory consideration for long-running sessions with many completed tasks (need cleanup strategy)
