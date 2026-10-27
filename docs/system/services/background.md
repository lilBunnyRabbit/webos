# BackgroundService

Key `background` · Depends on: files, notifications, apps, session · ADR: [081](../../adrs/081-background-apps.md) · Source: `src/lib/core/api/services/background/`, `src/lib/core/utils/worker/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Runs an app's code with no window: one job per app per browser, held by a Web Lock, its status shared with every tab. The app's windows are views onto the job, so closing them leaves it running and two windows show one job. Motion Watch is the only user: its camera, detection and clip saving run here.

The same class runs on every platform and in solo (ADR-047).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `tab` | `TabId` | Random per page load, 8 characters |
| `list()` | `() => BackgroundJob[]` | Every job in this browser, this tab's first. Reactive |
| `get(app_id)` | `(AppId) => BackgroundJob \| undefined` | |
| `start(app_id, props?)` | `Promise<boolean>` | Loads the app's manifest and its `background` module, checks `props` against the manifest's schema (no schema: no props), then requests the lock `ifAvailable`. `true` when this tab runs it (started now, already running, or a start already on its way in this tab), `false` when another tab holds it. A job here that is still stopping isn't "already running": the start waits for it to end, then takes the lock. Rejects for an unknown app, an app with no `background`, or props that fail the schema |
| `stop(app_id)` | `Promise<boolean>` | This tab's job: aborts its signal and resolves once the job has returned and its lock is free. Another tab's: posts `stop` to it and resolves `true` at once. `false` when nothing runs |

```ts
interface BackgroundJob {
  app_id: AppId;
  status: string;            // ctx.status(); "" until set
  since: number;
  tab: TabId;
  here: boolean;             // this tab runs it
  solo: boolean;             // a solo tab runs it
  workers: { id: number; name: string; since: number }[];
  view: unknown;             // ctx.share(); null in other tabs
}
```

Pure helper exported from `$lib/core/api`: `format_since(since, now)` ("12 s", "4 min", "2 h 5 min", "3 d").

## Writing a job

```ts
// index.ts
define_app({ /* … */ background: () => import("./watch.svelte") });

// watch.svelte.ts
const run: BackgroundRun = async (ctx) => {
  ctx.status("Starting");
  const worker = ctx.spawn<Api, Event>(MyWorker, { name: "Detector", on_event });
  ctx.share(live);               // the windows read it through background.get(id).view
  await ctx.resumable();         // offer Resume if the page closes while this runs
  await until_aborted(ctx.signal);
  await worker.call("finish", null);   // still alive: workers end when the job returns
};
export default run;
```

| `ctx` member | Does |
|--------------|------|
| `app_id`, `props` | The app and the checked props |
| `signal` | Aborted by Stop (the app's own button, `bg stop`, Activity Monitor, another tab's `stop`) and when the service is destroyed (page closing). The job should let go of everything and return |
| `status(text)` | The one-line status every tab shows; posted to other tabs when it changes |
| `share(view)` | One live object for the app's windows in this tab (reactive state, a `MediaStream`); the last one wins. Other tabs get `null` |
| `resumable(props?)` | Writes a Resume entry with these props (the job's own when omitted); `null` removes it |
| `spawn(WorkerCtor, options?)` | The worker helper's `spawn` (`$lib/core/utils/worker`, also `$kit/utils/worker`) with a `name`: listed under the job, ended when the job returns. Not on abort, so a job can still ask its worker to finish a write after Stop. **Inside a job use `ctx.spawn`; windows and services use plain `spawn`**, which the service doesn't track |

Services come through `kernel.service`, app data through `json_file`, as in `on_fire` and widgets; there's no app context. A job that throws (other than after Stop) is logged and toasted from the app as "{App} stopped" with the error's message, and leaves the list.

## Locks and tabs

- **One per app per browser.** `navigator.locks.request("webos.background.{app_id}", { ifAvailable: true }, …)`, held for as long as the job runs. Never `steal`: a second tab's `start()` resolves `false`, its window shows "Watching in another tab".
- **Channel** `webos.background`:

| Message | Sent | Others |
|---------|------|--------|
| `{ type: "hello", tab }` | at init | a tab with jobs answers with `jobs` |
| `{ type: "jobs", tab, jobs }` | after any change to this tab's jobs (start, end, status, workers) | replace that tab's entries; an empty list drops the tab |
| `{ type: "gone", tab }` | `pagehide` and `destroy()` | drop the tab |
| `{ type: "stop", app_id }` | `stop()` of another tab's job | the holder stops it |

- **Stopping.** On abort the job's status becomes "Stopping" (announced; later `ctx.status()` calls are ignored). When it returns, its workers end and its resume entry goes while the lock is still held; the job leaves this tab's list, `jobs` goes out and `stop()` resolves only after the lock is released. So no tab sees it idle while its lock is held, and a start right after one sees the lock free.
- **Sweep.** A tab that dies without `gone` (a crash) would stay listed: while any other tab's job is listed, every 15 s `navigator.locks.query()` drops entries whose lock isn't held.

## Resume

A job never restarts by itself after a reload. `/var/lib/background/state.json`:

```json
{ "version": 1, "resume": { "motion-watch": { "props": {}, "since": 1793107682941 } } }
```

- Written by `ctx.resumable()` and removed when the job returns, throws or is stopped, each a read-modify-write under the Web Lock `webos.background.state` through `LatestWriter`. A page that closes while the job runs skips the removal (the service is destroyed first), so the entry stays.
- After the Restore answer (session status no longer `pending`, like VersionService's prompts), each entry whose lock no tab holds gets a toast from its app, "Resume {App}?" ("It was running in the background when WebOS closed."), with **Resume** (`start(app_id, props)`) and **Dismiss** (drops the entry). A toast left alone asks again at the next boot. An entry for an app the registry doesn't know is dropped.
- Parse: missing, broken or another version is empty; a bad entry is dropped alone (`persistence.ts`, Node-tested).

## UI

- **Taskbar.** `background-indicator.svelte`, before the tasks indicator: the first job's app icon with a primary dot while any job runs in any tab; the label names the app or counts them. Click: Activity Monitor › Background.
- **Mobile.** No taskbar: the notification center shows "{App} running in the background · Show" (`notification-list.svelte`, `tasks` prop), and the switcher shows the center while a job runs even with no notifications.
- **Activity Monitor › Background.** Every job: app icon and name, This tab / Another tab / Solo tab, status line, run time, workers with name and uptime, Open (launch the app) and Stop.

## Lifecycle

`init()`: opens the channel, posts `hello`, adds the `pagehide` listener, waits for the Restore answer to offer Resume. `destroy()`: posts `gone`, aborts every job here (their entries stay for Resume), closes the channel, stops the sweep, removes the effect and listener. Jobs' locks go with the page.

## Persistence

| Where | What |
|-------|------|
| `/var/lib/background/state.json` | Resume entries, above |
| memory | Jobs, other tabs' lists |

## Shell

`shell.ts`:

| Command | Does |
|---------|------|
| `bg ls` | Yields a `background` value per job, in any tab |
| `bg stop <app>` | Stops the app's job wherever it runs (`app` completer). Hidden with no jobs |

- Value type `background`: columns app, status, since (run time), tab (`this`, another tab's id, `(solo)` after a solo tab's).
- No `bg start`: starting needs the app (camera permission, a click).

## Solo

A solo tab may run its own app's job. Nothing is ever stolen, so it never takes a lock from a full tab, and a full tab never takes one from it. It offers Resume only for its own app (the id in `#/solo/{id}`).

## Mobile

Same API. Phones stop the camera when the screen turns off or the browser goes to the background, and freeze background tabs: a job there lives as long as the page is in front. Motion Watch says so in its window and keeps the screen on while it shows a running watch.

## Known gaps

- A job that ignores its signal can't be stopped; `stop()` waits for it.
- `stop()` of another tab's job resolves before that job has ended.
- The resume entry is written only when the job asks; a job that crashes the page loses nothing else, but one that never calls `resumable()` is never offered.
