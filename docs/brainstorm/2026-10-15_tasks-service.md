# Tasks service: unparked

**Date:** 2026-10-15
**Participants:** owner, Claude

## Context

ADR-013 (parked on [2026-10-12](2026-10-12_tasks-parked.md)) plans a `tasks` service that wraps `@lilbunnyrabbit/task-manager`. Two consumers now hand-roll it: `core/utils/zip/job.svelte.ts` (`ArchiveJob`) and `apps/user/pdf-tools/job.ts` (`run_job`), each with a progress toast, Cancel, and an abort check.

## Topics

### What the package (1.0.1) gives
- `createTask({ name, execute })` returns a builder. A `Task` has status `idle | in-progress | error | success`, progress 0..1, an `Optional` result and logs. Inside `execute`, `this` is the task.
- `createTaskGroup({ mode: sequential | parallel, flags: CONTINUE_ON_ERROR, tasks })` nests, with combined progress.
- `TaskManager` is a queue with `start`, `stop`, `reset`, `clearQueue` and a `TaskQuery` over earlier results.
- Changes arrive on an event emitter (`param`, `progress`, `transition`, `success`, `error`), which bridges cleanly to `$state`.

### Gaps against ADR-013
1. **No cancel.** `stop()` takes effect only between tasks, there's no `AbortSignal` in `execute`, and there's no `cancelled` status.
2. **No retry or backoff.** `reset()` clones and re-runs the whole queue.
3. **No message.** The logger is `protected`.
4. **A manager runs once.** After `success` it's finished, so it's one manager per job.
5. **Packaging.**
   - The build is CommonJS only, so it isn't tree-shaken.
   - `uuid` is a dependency where `crypto.randomUUID` would do.
   - `typedoc` is listed in runtime `dependencies`.
   - `start()` warns with `console.warn` instead of throwing.

### Decisions
- **Package first** (owner, then reversed the same day). The first plan was to fix the gaps in task-manager and release 2.0:
  - `this.signal` and `this.setMessage()`
  - a `cancelled` status and `cancel()`
  - retry with backoff
  - an ESM-only build

  It was built, then reverted unpublished. Today's consumers need none of it inside the package, so it would have been speculation.
- **Use 1.0.1 as is** (owner). WebOS owns what the package lacks, in its job mirror:
  - **Cancel:** an `AbortController` per job. The task reads the signal through `ctx`, and `job.cancel()` aborts it and calls `manager.stop()`.
  - **Cancelled:** a task failing with an AbortError shows as cancelled.
  - **Message:** `ctx.message(text)` sets `job.message`.
  - **Retry:** `run` takes a builder `(ctx) => ExecutableTask`, and retry builds a fresh manager from it, with a fresh controller and the same job id.
  - **Progress:** comes from the manager's events. Work reports it with the package's own `this.setProgress()`.
- **First consumers** (owner): Archive (`ArchiveJob`) and PDF Tools (`run_job`). Both files get deleted; Image Tools batch comes next.
- **Shell** (owner): `task list` (columns), `task cancel <id>`, `task retry <id>`, `task clear`, plus a `task` arg kind with a completer. No shortcut for now.

### WebOS side (owner)
- **One TaskManager per job.**
  - `tasks.run(app_id, (ctx) => task, { title, done, failed })` returns a `TaskJob`: a thin `$state` mirror (status, progress, message) that also exposes `manager` and a `done` promise (null on cancel or failure).
  - The service also has `jobs` (newest first, capped at 50), `active_count`, `get`, `cancel`, `retry`, `remove` and `clear`.
  - A shared manager is out, because a package manager runs only once.
- **Automatic progress toast** with Cancel, like `ArchiveJob`. It becomes a done or failed toast. Consumers can pass only `done(result)` and `failed()` reports (title, message, actions); cancelled uses the default text.
- **Surfaces:**
  - A Tasks tab in Activity Monitor.
  - A taskbar tray indicator when `active_count > 0`, which opens the Tasks tab on click.
  - On mobile, a line in the notification center.
- **Lifetime:** tasks outlive their window and live in memory only. A reload ends them, and there is no `/var/lib/tasks`.

## Action items
- [x] Package 2.0 built and reverted, unpublished
- [x] ADR-013 revision
- [x] Implement on 1.0.1. PDF Tools keeps `run_job` as an adapter over `tasks.run` (its four sections call it), `ArchiveJob` is deleted
- [ ] Image Tools batches on a task group
