# TasksService

Key `tasks` · Depends on: `notifications` · ADR: [ADR-013](../../adrs/013-tasks-service.md) · Source: `src/lib/core/api/services/tasks/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Background work with progress, Cancel and retry, on `@lilbunnyrabbit/task-manager` 1.0.1. A job outlives the window that started it and gets a progress toast, a row in Activity Monitor › Tasks, and a taskbar indicator. Archive (zip and unzip, including File Explorer's Compress and Extract here), folder uploads (`components/files/upload-folder.ts`), PDF Tools, Image Tools (Poster print, Squash, atlas saves), the Image Tools and PDF Tools test file generators, Video Tools exports, Hopsprite exports, API Client downloads, on-device AI model downloads ([ai](ai.md)), and backups (create and restore) run on it.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `jobs` | `TaskJob[]` | Newest first. A retried job moves to the top. Capped at 50; running jobs stay past the cap |
| `active_count` | `number` | Running jobs |
| `run` | `<T>(app_id, build: (context: TaskContext) => ExecutableTask, options: TaskRunOptions<T>) => TaskJob<T>` | Calls `build` and runs the task or group in a new `TaskManager` |
| `get` | `(id) => TaskJob \| undefined` | |
| `cancel` | `(id) => void` | Same as `job.cancel()` |
| `retry` | `(id) => boolean` | Failed or cancelled jobs only: calls `build` again and runs it in a fresh manager under the same id. `false` otherwise |
| `remove` | `(id) => void` | Finished jobs only |
| `clear` | `() => void` | Drops every finished job |

`TaskContext`, handed to `build`:

| Member | Notes |
|--------|-------|
| `signal` | `AbortSignal`, aborted by Cancel. Work passes it on (streams, `throwIfAborted`) |
| `message(text)` | The line under the title ("3 of 10", "2 MB of 8 MB") |
| `pace()` | Yields to the browser once the current slice passes 16 ms, so tight loops keep the UI responsive |

Progress is the package's own: work calls `this.setProgress()` inside `execute`, and the job reads it from the manager's `progress` event.

`TaskRunOptions<T>`: `title`, `done(result) => TaskReport`, `failed(error, cancelled) => TaskReport`, and `signal` (a second way to cancel, such as the shell's Ctrl+C). A `TaskReport` is `{ title?, message?, actions? }`.

`TaskJob<T>`: `id`, `app_id`, `title`, `created_at`, `finished_at`, `status` (`TaskJobStatus`: `running | done | failed | cancelled`), `progress` (0 to 1), `message`, `error`, `manager` (the package's `TaskManager`, `null` until its chunk loads), `done` (a promise of the current run's result, `null` on failure or cancel), `cancel()`.

## Behaviour & invariants

1. **One manager per run.** A package manager runs once, so `run` and `retry` each make a new one. `build` must return fresh tasks every time it's called.
   **Lazy package.** The service imports `@lilbunnyrabbit/task-manager` on the first run (about 11 KB gz, kept out of the boot chunk). So the work starts a tick after `run` returns, and Cancel can land before it does: work should begin with `context.signal.throwIfAborted()` rather than only listening for `abort`. Consumers that build tasks import `createTask` themselves, in their own lazy chunks.
2. **The result** is the root task's `result`. A root group gives `undefined`.
3. **Cancel** aborts the job's `AbortController` and calls `manager.stop()`. Package 1.0.1 has no cancel of its own, so the work has to watch `context.signal`. A run that fails after the abort counts as `cancelled`. Work that ignores the signal and finishes counts as `done`.
4. **Toasts.**
   - Every run notifies a `progress` toast with Cancel. Progress and message updates reach the toast, and the job's reactive `progress`, at most every 150 ms; an update inside the window is sent at its end, so the last one is never lost. The package's raw progress is kept in a plain field, and the final value is set on success (1), failure and cancel.
   - At the end, the toast becomes one of three:
     - **done** (`info`): the `done` report, or the title with "Done";
     - **failed** (`error`): `<title> failed` and the error;
     - **cancelled** (`warning`): "Cancelled" and the title.
   - `failed(error, cancelled)` overrides the failed and cancelled toasts; Archive uses it to offer Discard or Keep for a half-written file.
   - Retry dismisses the old toast and starts a new one.
5. Failures that aren't cancels go to `console.error` with the app id.

## Lifecycle

No `init` or `destroy`. Jobs run on the page's main thread.

## Persistence

None. A reload ends every running job and empties the list.

## Shell

`tasks/shell.ts` contributes:
- `task list`, which yields `task` values (columns `id name app status progress elapsed`).
- `task cancel <id>` and `task retry <id>`.
- `task clear`.

Ids are the first eight characters of the job id, completed by the `task` arg kind. See [shell](shell.md#contributions).

## UI

- **Activity Monitor › Tasks:** one row per job: title, status badge, app, message or error, progress, and Cancel, Retry or Remove. Clear finished sits in the header, and a link to the package on npm sits under the list. `apps.launch("activity-monitor", { section: "tasks" })` opens it.
- **Details toggle:** the caret on a row opens the run's tree (`task-details.svelte`).
  - **Bridge:** `TaskTree` (`task-tree.svelte.ts`) uses `createSubscriber`, so it listens to the manager, groups and tasks (`onAll`) only while the tree is on screen, and snapshots them on each event.
  - **Root group:** a lone root group named like the job is folded into a "sequential · 3 steps" line.
  - **Each node:** the package status as an icon, its name, the group's mode or the task's own `parse().status`, and a bar and percentage while running or failed.
  - **Logs:** a logs button opens the task's `logs`, which are kept scrolled to the newest (`flex-col-reverse`).
- **Taskbar:** a spinner before the notification bell while `active_count > 0`. It shows the count when two or more jobs run, and clicking it opens Activity Monitor › Tasks.
- **Mobile:** the notification center in the switcher shows an "N tasks running · Show" line (`NotificationList` `tasks` prop).

## Writing a task

The Example app's `example/task.ts` is the reference: about 20 s of parallel downloads, then steps with logs, then packing that can fail once (`example task --fail` in the Terminal, or the buttons in the app).

```ts
import { createTask, createTaskGroup, ExecutionMode } from "@lilbunnyrabbit/task-manager";

const job = tasks.run(
  "my-app",
  (context) => {
    const download = createTask<string, number>({
      name: "Download",
      parse() {
        if (this.status === "in-progress") return { status: `Downloading ${this.data}` };
      },
      async execute(file) {
        for (let chunk = 1; chunk <= 10; chunk++) {
          context.signal.throwIfAborted();
          await fetch_chunk(file, chunk, context.signal);
          this.setProgress(chunk / 10);
        }
        this.logger.info(`${file} done`);
        return 3;
      },
    });
    const downloads = createTaskGroup({ name: "Downloads", mode: ExecutionMode.PARALLEL, tasks: () => files.map((file) => download(file)) });
    return createTaskGroup({ name: "Import", tasks: () => [downloads(), save()] })();
  },
  { title: "Importing 4 files", done: () => ({ title: "Imported", actions: [{ label: "Open", on_click: open }] }) }
);
await job.done; // null when it failed or was cancelled
```

- **`build` runs again on Retry**, so it creates the tasks inside it.
- **Every abortable wait takes `context.signal`.** Check it first: work starts a tick after `run`, once the package has loaded.
- **`this` in `execute` is the package's `Task`.** Use `this.setProgress()`, `this.logger` and `this.query`. `query` sees its own group's tasks; reach into a nested group with `this.query.get(group).query`.
- **`context.message()`** sets the line shown in the toast and the Tasks row.

## Known gaps

- No automatic retry or backoff; retry is manual.
- Zip runs as groups: compression is a task per picked file or folder, then "Write archive" (`ZipWriter` appends in order); extraction is "Create folder", then a task per top-level file or folder of the archive (`ZipExtractor`). Both are sequential. PDF Tools runs a sequential group with a task per unit through its `run_job(app_id, title, build, report)` (`pdf-tools/job.ts`): export a task per page, split a task per part, merge and images a task per source PDF or image appended to one `PdfWriter`, then "Write PDF". Backup create is a task per picked area, then "Save to device"; restore is "Clear /tmp/restore", a task per area unpacked into the stage, then "Replace and reload", which ignores Cancel ([backup](backup.md#restore)). Image Tools batches are single tasks for now, except Poster print, which reuses PDF Tools' `run_job`: an "Assembly map" task, a task per sheet cut from the one decoded image and appended to a `PdfWriter`, then "Write PDF". The test image and test PDF generators (`image-tools/test-image-job.ts`, `pdf-tools/test-pdf-job.ts`) are sequential steps: render (or lay out) with progress per band or page, then "Write file"; output collects in Blobs and is written once, so Cancel leaves no file.
- Cancel only lands where the work checks the signal.
