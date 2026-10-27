# ADR-081: Background Apps
**Date:** 2026-10-27
**Status:** Implemented

> **Revision 2026-10-27: stopping.** A stopped job shows the status "Stopping" until it has ended. It leaves the lists (this tab's and, through `jobs`, the others') only after its lock is released, so another tab never sees it idle while the lock is held. `start()` while this tab's job is still stopping waits for it to end and starts a new one, instead of answering `true` for the job on its way out.

## Context
Motion Watch has to keep a camera open, detect motion and save clips with no window open: closing the window must not stop the watch, and two windows must show one watch, not open the camera twice. Nothing in WebOS runs app code without a window except the scheduler's `on_fire` hook, which runs once per fired job and ends. The owner asked whether this wants a kernel worker service ([brainstorm](../brainstorm/2026-10-27_motion-watch.md)); decided 2026-10-27: a service that runs app *jobs* (any windowless code), with workers as a detail inside a job, plus a kit worker helper for everyone else.

## Decision

**Worker helper** (`$lib/core/utils/worker`, re-exported as `$kit/utils/worker`). `spawn<Api, Event>(WorkerCtor, { on_event, stopped })` → `call(method, input, { transfer, signal })`, `terminate(reason)`; the worker side is `serve<Api, Event>(handlers)`, which returns `emit(event)`; `transfer(value, list)` moves buffers either way. Aborting a call ends the worker and rejects every pending call; an uncaught worker error rejects what's pending. Pools, singletons and use counts stay with the caller: the codecs pool and Warren's speller moved onto it with no behaviour change. It lives in core because background jobs (core) spawn through it; kit re-exports it (CONVENTIONS' core-or-kit rule).

**BackgroundService** (`background`), depends on files, notifications, apps, session. Same class on every platform and in solo.

- **Manifest.** `background: () => import("./watch")`, a lazy part like `on_fire` (in `LAZY_PARTS` and the catalogue). The module default-exports a `BackgroundRun`: `async (ctx) => void`, which runs until `ctx.signal` aborts or it returns.
- **Context.** `{ app_id, props, signal, status(text), share(view), resumable(props?), spawn(WorkerCtor, options?) }`. Services through `kernel.service`, app data through `json_file`, as in `on_fire` and widgets. `share(view)` hands the app's windows in this tab one live object (reactive state, a `MediaStream`); the last one shared wins. `spawn` wraps the worker helper: the worker is ended when the job returns and listed under the job in Activity Monitor and the inspector. **Inside a job use `ctx.spawn`, everywhere else plain `spawn`**; the service doesn't track windows' or services' workers.
- **API.** `start(app_id, props?)` → `true` when this tab runs it (started now or already), `false` when another tab does. `stop(app_id)` stops it wherever it runs. Reactive `list()` and `get(app_id)`: `{ app_id, status, since, tab, here, solo, workers, view }`. Props are checked against the manifest's `props`; no schema means no props, as with `launch()`.
- **One per app per browser.** Web Lock `webos.background.{app_id}`, requested `ifAvailable`, never `steal`: stealing would restart the camera and lose the pre-roll. A second `start()` anywhere resolves `false`.
- **Other tabs.** BroadcastChannel `webos.background`: `hello` on boot (holders answer), `jobs` with a tab's whole list on every change, `gone` on pagehide and destroy, `stop` to ask the holder to stop. A tab that dies without `gone` is swept: every 15 s while other tabs' jobs are listed, entries whose lock isn't held drop.
- **Windows are views.** Two windows of an app read the same job; closing every window leaves it running. In another tab the window shows "running elsewhere" with its status line.
- **Reload.** A job never restarts by itself. `ctx.resumable(props?)` saves an entry in `/var/lib/background/state.json` (`{ version: 1, resume: { [app_id]: { props, since } } }`, one file, written under the Web Lock `webos.background.state` after a re-read). The entry goes when the job returns, throws or is stopped; only a page that closed while it ran leaves it. After the Restore answer, each entry whose lock nobody holds gets a toast "Resume {App}?" with Resume and Dismiss; Dismiss drops the entry, ignoring the toast asks again next boot.
- **Errors.** A job that throws (not after Stop) is reported as an error toast from the app, "{App} stopped", and leaves the list.
- **UI.** A taskbar indicator (the first running app's icon with a primary dot) while any job runs in any tab, opening Activity Monitor › Background; on mobile a line in the notification center, which shows in the switcher while a job runs. Activity Monitor › Background lists every job with its status, run time, tab, workers (name and uptime), Open and Stop. The inspector shows the same.
- **Shell.** `bg ls` yields `background` values (columns app, status, since, tab); `bg stop <app>` (the `app` completer). No `bg start`: starting needs the app's own UI (camera permission, a click).
- **Solo.** A solo tab may run its own app's job; it never takes a lock from anyone (nothing is stolen), and it offers Resume only for its own app.
- **Mobile.** Same API. The OS stops the camera when the screen turns off or the browser goes to the background; the app says so.

## Alternatives Considered
- **A kernel worker service** owning every worker. Rejected: the thing that needs to outlive a window is the job (camera, files, notifications on the main thread), not the worker; workers stay a detail of whoever spawns them, and `ctx.spawn` gives visibility for jobs' workers without a registry of all workers.
- **Steal the lock** so the newest tab wins. Rejected: restarting the camera loses the pre-roll ring and asks for permission again.
- **Auto-restart after reload.** Rejected: a camera turning itself on after a reload is a surprise; Resume asks.
- **Views subscribe to an event channel.** Rejected for now: a late window needs the current state, not the next event; one shared live object covers both and costs nothing extra.
- **Resume state per app** (`/var/lib/apps/{id}/…`). Rejected: the service owns resuming, so it owns the one file.

## Consequences
- Any app can now run code with no window; only Motion Watch does.
- The boot path gains one small service chunk, loaded beside the boot chunk like `speech`.
- A job that ignores its signal can't be stopped; `stop()` waits for it.
- Hidden tabs throttle timers but not a worker reading a `MediaStreamTrackProcessor` stream, which is why Motion Watch's work sits in a worker.
