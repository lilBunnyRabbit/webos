# SchedulerService

Key `scheduler` · Depends on: files, notifications, apps, shell · ADR: [062](../../adrs/062-background-scheduler.md) · Source: `src/lib/core/api/services/scheduler/`, `src/lib/core/api/services/notifications/system.ts`, `public/sw-notifications.js`, `src/lib/core/utils/zoned.ts`, `src/lib/core/utils/when.ts` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Fires scheduled notifications for every app while any WebOS tab or installed-app window lives, with no app window open. Apps hand it jobs (an alarm, a timer's end, a reminder); one tab per browser keeps one timer and shows the notification through the service worker, so it works on Android, has buttons, and a click reaches a tab even after the one that scheduled it closed. Nothing fires with every tab closed except through Chrome's flagged Notification Triggers; what was missed meanwhile is summed up at the next boot.

The same class runs in solo (ADR-047): a solo tab joins the leader lock but never takes it from a full tab.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `jobs` | `Job[]` | `$state.raw`, the registry in file order. Other tabs' writes arrive through the BroadcastChannel |
| `is_leader` | `boolean` | This tab holds `webos:scheduler` and fires |
| `triggers` | `boolean` | `"showTrigger" in Notification.prototype` |
| `missed` | `MissedJob[]` | `{ id, app, title, kind, due }` this tab found missed, oldest first, capped at 50. Memory only; the lasting record is each job's `missed_at` |
| `last_jump` | `number \| null` | When the leader last saw the wall clock drift more than 5 s from `performance.now()` |
| `schedule(app, input)` | `(app, JobInput) => Promise<Job>` | Adds `"{app}:{key}"` or replaces the job with that id, in place, with `armed_at` = now: an occurrence already past never fires. `armed` defaults to `true`. Rejects an invalid job without writing |
| `update(id, patch)` | `(id, JobPatch) => Promise<Job \| null>` | Merges; a key set to `undefined` is removed. `armed_at` and `last_fired` are ignored, and `missed_at` can only be cleared. Changing `at` or `repeat`, or switching `armed` back on, sets `armed_at` = now. `null` for an unknown id |
| `cancel(id)` | `(id) => Promise<boolean>` | |
| `get(id)` / `list(app?)` | | From `jobs` |
| `next(id)` | `(id) => number \| null` | The pending occurrence (`pending(job)`); in the past when it's overdue and about to fire |

Pure helpers, exported from `$lib/core/api`: `next_occurrence(job, after)`, `pending(job)`, `format_repeat(repeat)`, `MISSED_AFTER`.

### Job

```ts
interface Job {
  id: string;                 // "{app}:{key}"
  app: string;
  title: string;
  message?: string;
  at: { epoch: number } | { date: string; time: string; tz: string };
  repeat?: Repeat & { until?: string; skip?: string[] };
  armed: boolean;
  snooze_until?: number;
  armed_at?: number;         // set by the scheduler: occurrences before it never count
  last_fired?: number;       // the last occurrence that fired
  missed_at?: number;        // the latest occurrence counted as missed; the app reads and clears it
  actions?: { label: string; command: string }[];   // at most 2
  open?: { app: string; props?: Record<string, unknown> };
  kind: "alarm" | "timer" | "reminder" | "phase";
  silent?: boolean;          // no in-page chime; the OS notification still follows the system's sound settings
}
type Repeat = { every: "day"; interval?: number } | { every: "week"; days: number[] } | { every: "month"; day: number } | { every: "year" };
```

- `at.epoch` is a one-shot instant (timers). `{ date, time, tz }` is a wall time in an IANA zone; for a repeating job `time` is every occurrence's time and `date` the first day the rule may fire on. A repeating job must use the wall form (schema refine).
- `until` is the last day it may fire on, inclusive; `skip` lists days it doesn't. Both `YYYY-MM-DD` in the job's zone; a skip names the occurrence's real day (a clamped 31 in February is `…-02-28`).
- `actions` run as shell command lines in a WebOS tab ([shell](shell.md)), so they survive reloads and work from the service worker. `open` is what a body click opens; the owning app when absent.
- `kind: "alarm"` sets `requireInteraction`: the notification stays until dismissed. The toast of an alarm also stays (`duration: null`).
- `kind: "phase"` is a generic timed phase ending, one step of a routine (Pomodoro's focus and breaks today, any interval app tomorrow): it differs from `timer` only in its softer chime.
- `silent: true` skips the in-page chime for that job (Pomodoro's Sound switch off). The OS notification isn't made silent: whether it sounds is the system's setting.

### Permission

There's no scheduler call for it. An app calls `notifications.request_system()` in the click that creates its first job, before `schedule()`, so the browser's prompt counts as user-initiated. Settings › Notifications shows the state, Allow and Send test.

## Occurrences

`occurrence.ts`, pure, Node-tested (`occurrence.test.ts`, `zoned.test.ts`).

`next_occurrence(job, after)` is the first instant strictly after `after` at which the job fires:

- Disarmed: `null`, snooze included. A snooze (`snooze_until > after`) fires ahead of the rule: the result is the earlier of the snooze and the rule's next occurrence. To snooze a fired one-shot, set `armed: true` with `snooze_until`; switching it on sets `armed_at` past the old `at`, so only the snooze is pending.
- One-shot: `at` if it's after `after`.
- Repeating: candidate days from the first day (`at.date`), stepped on the calendar, each turned into an instant in the job's zone:
  - `day`: `at.date + k × interval`, so the interval stays aligned to the first day.
  - `week`: every listed weekday (`0` = Sunday) on or after the first day.
  - `month`: day `min(day, days in month)`: 31 fires on 30 April and 28 or 29 February.
  - `year`: `at.date`'s month and day; 29 February fires on the 28th in other years (same clamp as months).
  - Candidates start two days before `after`'s local day, so a time shifted onto the next day (below) or a date-line change isn't skipped. A rule that yields 20 000 candidates without an answer gives `null`.

Wall time to instant is `wall_to_epoch(date, time, zone)` in `src/lib/core/utils/zoned.ts`, on `Intl.DateTimeFormat` (no Temporal: Node 24, which runs the unit tests, doesn't ship it):

- **Gap** (spring forward, a skipped day like Samoa's 2011-12-30): shifted forward by the gap. 02:30 on a night that jumps 02:00 → 03:00 fires at 03:30. On a skipped day, the next day at the same time.
- **Overlap** (fall back): the first pass, the earlier instant. A daily 01:30 fires once that night.
- Days step on the calendar, never by 24 h, so the wall time holds across DST.

`pending(job)` is the occurrence waiting to fire, overdue when in the past: the first one at or after `armed_at`, after `last_fired` and after `missed_at`. The three fields, all written only by the scheduler:

| Field | Set to | When |
|-------|--------|------|
| `armed_at` | now | `schedule()`, and `update()` that changes `at` or `repeat` or switches `armed` back on. Without it a daily 07:00 alarm set at 10:00 would count today's 07:00 as missed, and a one-shot set in the past would fire. An occurrence exactly at `armed_at` counts |
| `last_fired` | the occurrence's instant | it fired. Never anything else |
| `missed_at` | the latest occurrence at or before now | it was counted as missed. The owning app reads it and clears it with `update(id, { missed_at: undefined })`; on a repeating job, clearing it moves `armed_at` just past it so the skipped occurrences don't come back |

### The plan

`plan(jobs, now)` decides one pass:

- Not due (`pending` null or after `now`): unchanged.
- Due at most `MISSED_AFTER` (2 min) ago: **fires**. `last_fired` = the occurrence, a snooze at or before it is cleared, a one-shot is disarmed.
- Due longer ago: a repeating job whose rule has an occurrence within the last 2 min fires that one; otherwise **missed**: `missed_at` = the latest occurrence at or before now (the due one for a one-shot), snooze cleared, a one-shot disarmed, `last_fired` untouched. Missed occurrences aren't backfilled: a daily alarm missed for three days is one missed entry, then tomorrow's.

## Leader

Web Locks, `webos:scheduler`, one holder per browser profile:

- At init every tab requests the lock. A **full** tab that is visible requests it with `steal: true`, and steals again whenever it becomes visible while not leading (visibilitychange, focus, pageshow, resume). Becoming visible fires visibilitychange and focus together, so a steal still pending (requested, not yet granted) isn't requested a second time. A **solo** tab and a hidden tab queue with a normal request. So the visible full tab leads, and when the leader closes, the next queued tab takes over.
- A stolen tab stands down (timer cleared) and queues again.
- `destroy()` aborts a queued request and releases a held lock.

While there are jobs, the leader keeps one `setTimeout`: to the next due occurrence when it's less than 60 s away, otherwise to the next minute boundary (`60 s - now % 60 s`, the taskbar clock's tick), so a hidden tab's idle wake-up shares the clock's instead of adding its own. With no jobs there's no timer at all: the first `schedule()`, a re-read or another tab's ping runs a pass, which arms it again. Each wake-up runs a **pass**, then re-arms:

1. Under the store lock: read `jobs.json`, `plan()`, write back if changed.
2. Fire what fired, report what was missed (below), sync triggered notifications.
3. Re-arm. The timer is set after the pass's storage I/O, never straight inside the timer callback, so Chrome doesn't count it as a chained timer and throttle it to once a minute in a hidden tab.

Passes run one at a time; a request during one runs one more after it. A pass that throws (storage error) re-arms no sooner than 5 s instead of spinning on the job it couldn't record. Wake-ups also come from becoming visible (visibilitychange to `visible` only; going hidden does nothing), `resume`, `pageshow`, `focus`, a registry change in this tab, and the BroadcastChannel. A wake-up of a leader with no jobs runs no pass, so alt-tabbing with nothing scheduled takes no lock and reads no file. Each compares the wall clock against `performance.now()` since the last arm: more than 5 s apart sets `last_jump` (sleep or a changed clock); the pass itself is the same.

## Registry and cross-tab

`/var/lib/scheduler/jobs.json`, `{ version: 1, jobs: Job[] }`, pretty-printed (`persistence.ts`, zod). There's no migration from the apps' own files: nobody used the old fields yet (owner, 2026-10-21), so the alerting apps switch to the registry and ignore them. Unknown keys, such as a `migrated` marker from a pre-release build, are dropped on load.

- **Load.** Missing, not JSON, or another version: empty. A job that fails the schema is dropped alone with a warning, so one bad hand edit doesn't lose every alarm; a duplicate id keeps the first. The next write leaves them out.
- **Write.** `RegistryStore.transact()` (`store.ts`) takes the `webos:scheduler-store` lock, re-reads the file, applies the change, writes it through a `LatestWriter` (seeded with the text just read, so a write equal to what another tab left on disk is skipped correctly) and awaits it, then releases. Every mutation and every pass goes through it, so two tabs never overwrite each other's changes and a leader handover can't fire one occurrence twice: the second pass reads the first one's `last_fired` or `missed_at`.
- **Others.** After a write the tab posts `{ type: "changed" }` on the `webos:scheduler` BroadcastChannel; the others re-read. An edit made in this tab another way (Terminal, Text Editor) bumps the folder's revision, which also re-reads; the revision effect's first run only subscribes, since `init()` has just read the file. Re-reading skips identical text.

## Firing

For each fired job:

- An OS notification through `registration.showNotification` (`notifications/system.ts`): `tag` = job id, `renotify: true` (a fired daily alarm replacing yesterday's still alerts), `requireInteraction` for alarms, `timestamp` = the occurrence, `actions` from the job's labels, `data = { source: "scheduler", id, route, commands }` where `route` is `#/app/{open.app}?{open.props}`. Only when permission is granted; never asks.
- When this tab is visible, also a toast from the job's app: its actions run their command through `shell.execute`, plus Open (`apps.launch(open)`).

**Chime.** After the pass, when it fired a job of kind `alarm`, `timer` or `phase` that isn't `silent` and the page has had a user gesture since load (`navigator.userActivation.hasBeenActive`, browsers keep audio off until then), the leader plays one chime from `chime.ts` (loaded on first use): a bright two-note call three times for alarms and timers, one soft pair for a phase (any app's timed phase, not only Pomodoro's). One per pass, the loudest kind that fired, so jobs due together don't stack. Without a gesture, the OS notification's sound carries it. Apps play nothing themselves.

Without an active service worker (the dev server) the helper uses a page `Notification` without buttons; its click goes to this tab's own click listeners.

## On-fire hook

An app that has to act when its job fires, with nothing of it loaded, declares a handler in its manifest ([manifest](../apps/manifest.md#on_fire-adr-062)):

```ts
define_app({ /* … */ on_fire: () => import("./on-fire") });

// on-fire.ts
const on_fire: OnFire = async (job, { outcome, due }) => { /* … */ };
export default on_fire;
```

- **Who calls it.** Only the leader, from its pass: once per fired occurrence (`outcome: "fired"`, `due` = the job's new `last_fired`) and once per occurrence counted as missed (`"missed"`, `due` = its `missed_at`). Every occurrence is planned under the store lock, so across tabs and leader handovers it's called once.
- **When.** After the notification: for a fired job once the OS notification (and, in a visible tab, the toast) is shown; for a missed one after the missed summary. The handler gets the job as the registry holds it after the pass (a one-shot already disarmed).
- **Order.** Handlers run one at a time on a queue of their own, in firing order, so a slow one never holds up the timer or the next pass, and two jobs of one app don't race. The module loads on first use (`apps.get(app).on_fire()`), so nothing joins the boot chunk.
- **Errors.** A throw or rejection, from loading the module or from the handler, is logged and shown as an error toast from the app ("Couldn't finish “{title}”"); the queue carries on. Never retried.
- **Nothing more.** There's no handler for a job whose app isn't registered, and none in a follower tab. In solo a leading solo tab runs every app's handler (manifests are all registered there).

Pomodoro uses it to count a phase's end and chain the next one ([below](#pomodoro)). Calendar uses it to point a repeating reminder's body click at the next occurrence's day ([below](#calendar)).

## Missed

Found by a pass, at boot or later. The first pass after this tab starts leading says "closed", any later one "asleep":

- One OS notification "N missed while WebOS was closed" (tag `scheduler:missed`) with the titles as its body.
- A notification-center entry per job ("Missed · due …", warning, its toast hidden at once) and one summary toast.
- The job's `missed_at` is set in the same write, so the app's on-fire handler, or the app opened later, learns about it (a Pomodoro phase pauses and shows when it ended) and clears it. Also appended to `missed` (this tab, memory only).
- When the tab is hidden, `navigator.setAppBadge(count)`, adding up across passes, and `{ type: "badge", count }` on the channel so every tab knows a badge is up. A tab becoming visible while a badge is up clears it (`clearAppBadge`) and tells the others (`{ type: "seen" }`) to reset their count; with no badge it does neither. A visible boot always clears it, since an installed app keeps its badge after the tab that set it closed. On a tab that isn't an installed app the calls do nothing.

## Notification clicks

`public/sw-notifications.js`, pulled into the generated worker by `workbox.importScripts` (`vite.config.ts`). The precache manifest is unchanged, so VersionService's precache parser still reads it.

On `notificationclick` the worker closes the notification and builds `{ type: "webos:notification-click", source, id, action, command, route }`, `command` being `data.commands[action]` for a button. Then:

1. It asks each WebOS window client in turn, most recently focused first (`clients.matchAll`, filtered to the worker's scope), over a `MessageChannel`, and focuses the first that answers `{ claimed: true }`. A client that doesn't answer in 1 s counts as no.
2. Nobody takes it: `clients.openWindow(scope + route)`. For a button, it waits (up to 20 s) for the new tab's `webos:ready` message, sent from `SchedulerService.init()`, then hands the click to it.

Who takes a click (`listen_clicks` in `notifications/system.ts`; each service answers only its own `source`):

| Source | Takes it | Then |
|--------|----------|------|
| `scheduler`, full tab | always | runs `command` through `shell.execute`, else launches the route's app with its props |
| `scheduler`, solo tab | a body click whose route is its own app | nothing more: the focus is the point. Anything else falls to a full tab or a new one |
| `notifications` | the tab whose `all` has the id | marks it read and runs `actions[action].on_click` |

## Closed tabs (Notification Triggers)

Only when `showTrigger` exists (Chrome's Experimental Web Platform features flag; development halted in 2019). After every pass the leader makes Chrome's set of triggered notifications match the next occurrence of each armed job: a job whose pending time changed or went away has its triggered notification closed (`getNotifications({ tag, includeTriggered: true })`), and one without gets `showNotification(..., { showTrigger: new TimestampTrigger(due) })` with the same options as firing. The first sync after taking the lead reads what's already triggered. When the leader fires a job it first checks for a shown notification with that tag and timestamp; when the trigger beat it, it doesn't show a second.

## Uninstalled apps

Every full tab watches `apps.is_installed` for the apps its jobs belong to (an `$effect` over `jobs` and AppsService's installed set). A job whose app is registered but not installed is dropped under the store lock; system apps are always installed, and an id AppsService doesn't know is left alone. Any full tab does it, not only the leader, because an uninstall changes only the tab it happened in. Solo tabs never do: a solo link opens an app that was never installed.

## Lifecycle

`init()`: reads the registry, opens the channel, adds the wake-up listeners, the folder-revision effect and the click listener, posts `webos:ready` to the worker, clears the badge when visible, requests the lock. The registry is read once: the folder-revision effect's first run doesn't re-read, and the first pass reads it under the store lock. `destroy()`: clears the timer, drops the lock request or releases the lock, closes the channel, removes every listener. A pass still in flight finishes its write; its error is not reported once destroyed.

## Persistence

| Where | What |
|-------|------|
| `/var/lib/scheduler/jobs.json` | The registry, above |
| memory | `missed`, the badge count (kept in step across tabs by `badge` and `seen` messages), which triggered notifications the leader knows of |

## Shell

`shell.ts`:

| Command | Does |
|---------|------|
| `sched ls [app]` | Yields a `job` value per job, soonest first, never and off last |
| `sched rm <job>` | Cancels one: exact id, else a unique id prefix, else a unique title. Hidden with no jobs |

- Value type `job`: columns app, title, next, repeat; `next` is a date and time, `never` (armed, no occurrence left) or `off`. Click opens the job's `open` (or its app).
- Completers: `job` (ids, title as detail) and `when` (`when_examples`: the next quarter hour about 30 min ahead, `10m`, `1h`, `tomorrow 9:00`).
- Arg kinds `arg.job()` and `arg.when()` (`shell/arg.ts`). A `when` value is read with `parse_when(text, now, zone)` from `$lib/core/utils/when`: `10m`/`1h30m` (instant from now), `18:30` (the next one), `today 18:30`, `tomorrow 9:00`, `2026-12-24 18:00` (wall time in the zone; a dated time already past is `null`). `parse_duration` and `parse_alarm_time` moved there from Clock; `parse_alarm_time` and `date.ts` `parse_time` both build on `zoned.ts` `parse_plain_time`, the one wall-time parser. `When` is an alias of `JobAt`. No core command takes a `when` yet; it's for the alerting apps' commands.

## Apps on it

| App | Jobs | Buttons | Body click | Kept by the app |
|-----|------|---------|------------|-----------------|
| Clock | `clock:alarm-{id}`, kind `alarm`: a one-off is `{ date, time, tz }` the next time the clock reads it, a repeating one starts today with `{ every: "week", days }`; tz is the device's when it's made. `clock:timer-{id}`, kind `timer`, `{ epoch }` | `alarm snooze {id}` (Snooze 10 min), `alarm stop {id}`; `timer restart {id}`, `timer stop {id}` | Clock on Alarms or Timer | `clock.json`: `alarms` and `timers` by job id: the label, a timer's length, and its time left while paused or reset (`left_ms`) |
| Recipe Box | `recipe-box:timer-{id}`, kind `timer`, `{ epoch }`, title the step's timer name, message the recipe | `recipe timer stop {key}` (Stop) | Recipe Box on that recipe (`open.props.path`) | nothing |
| Pomodoro | `pomodoro:phase`, kind `phase`, `{ epoch }`: the running phase's end; disarmed while paused | `pomo start` (Start break / Start focus), `pomo skip` (Skip, Skip break), `pomo pause` (Pause) | Pomodoro | `timer.json`: settings, task, the plan (phase, round, `left` while paused, `total`, the `settled` end) and a missed phase's `ended`; `stats.json` |
| Calendar | `calendar:reminder-{event id}`, kind `reminder`: `{ date, time, tz }` of the first occurrence's reminder, tz the device's when it's made; `repeat` is the event's rule moved back by the reminder's whole days | none | Calendar on the day of the occurrence it's for (`open.props.day`) | `events.json`: every event detail, including the reminder's minutes; nothing about when it last fired |

- **Clock timer state** comes from the job first: armed is running (ends at `at.epoch`); otherwise `left_ms` says paused or reset, and no `left_ms` is done. Each change writes the job and the extras in the order that keeps that true in between: start arms first, pause and reset write `left_ms` first.
- **Switching a one-off alarm back on** re-times it to the next time the clock reads its time, in its own zone. `alarm stop` drops a snooze and switches a one-off off when nothing is left to ring; `alarm snooze` arms the job with `snooze_until`, so a one-off that already rang rings once more.
- **Permission.** Clock's Save and Start, Recipe Box's timer buttons and Pomodoro's Start (window and widget) and Calendar's Save of an event with a reminder call `notifications.request_system()` in the click, before scheduling.

### Pomodoro

- **State** comes from the job and `timer.json`'s plan together (`run_of` in `pomodoro/pomodoro.ts`): an armed job is running and ends at `at.epoch`; otherwise the plan's `left` says paused; otherwise idle. Pause writes `left` first and then disarms the job; reset, skip and choose cancel it; start or resume schedules it afresh. While a write is in flight the page's timer shows the job it's writing, so nothing flashes idle.
- **Counting an end.** A job that fired (`last_fired`, disarmed) or was missed (`missed_at`) and isn't the plan's `settled` end gets counted: a focus goes into `stats.json`, `settled` is set, and the next phase follows `settle` (auto-started from the old end, or idle). One page-level timer per tab (`timer.svelte.ts`) does it, shared by the window, the widget, the `pomo` commands and the on-fire handler, through one queue; `settled` makes a second count in that tab a no-op.
- **Who counts.** The on-fire handler (`on-fire.ts`), in the leader tab, with nothing of Pomodoro loaded: it takes the page-level timer (a fresh one reads both files), counts, schedules the auto-started phase or cancels the job, and lets go. So an auto-started break rings its own end with Pomodoro closed everywhere, and a phase missed while WebOS was closed is paused at the next boot, not when Pomodoro next opens. A tab with Pomodoro loaded also counts the moment its registry shows the end, so its window doesn't wait for the handler; every action and `pomo` command counts first, so a button pressed right at the end sees the right phase. In the leader tab both go through the same timer and count once. Another tab with Pomodoro loaded counts from the same files and writes the same result.
- **Holding.** The page-level timer is released with its last window, widget or command; nothing keeps it loaded while a phase runs.
- **Missed.** The next phase waits paused at its full length, whatever auto-start says; `timer.json`'s `ended` shows "Focus ended at 14:02" in the window and in `pomo status` until the next action. `missed_at` is cleared with `update(id, { missed_at: undefined })`, leaving the disarmed job as the paused phase's slot.
- **Text.** Title "Focus done[: task]" or "Break over"; the message and buttons say what follows: "Time for a short break." with Start break and Skip, or "Short break started, 5 min." with Skip break (Pause after a break). While a phase runs, a settings or task change updates the job's text after 0.8 s.
- **Sound.** The job is `silent` unless Pomodoro's Sound switch is on (off by default); switching it during a phase updates the job with the text. "Play the chime" next to it plays the scheduler's phase chime (`scheduler/chime.ts`, imported on click), which also counts as the gesture audio needs.

### Calendar

- **Mapping** (`calendar/reminders.ts`, Node-tested). The reminder's wall time is the event's start (09:00 all day) minus its minutes, carried onto earlier days as needed: 00:30 with 1 hour is 23:30 the day before, `shift` 1. The job's `at.date` is the first occurrence's day minus `shift`, and its rule is the event's moved back by `shift` days: daily is `day`, weekly is `week` on the reminder's weekday, monthly is `month` on the day it lands on (or `31`, the month's end, when it always lands on the previous month's last day), yearly is `year`. `until` and every `skip` move back by `shift` too, so they stay one to one with the event's days.
- **Exactness.** A shifted monthly or yearly rule is checked against the scheduler's own `next_occurrence` (in UTC) over 48 months or 8 years, against Calendar's own occurrences. When it doesn't match (a day ahead of a monthly event on the 29th–31st, a week ahead of one on the 1st–7th, a day ahead of a yearly event on 29 February or of 1 March from a non-leap year), nothing is scheduled: the editor shows why under Reminder and won't save, and `cal add` fails with the same reason. A reminder on the event's day always maps.
- **Edit paths.** Saving an event, deleting one occurrence (`skip`), and `cal add` call `sync_reminder(event)` (`calendar/jobs.ts`); deleting an event cancels its job. A change that keeps the reminder's wall time and rule only updates the job's title and message, so it keeps its zone and `armed_at`; any other change schedules it afresh in the device's zone; no reminder, or none left from now on, cancels it.
- **On fire** (`on-fire.ts`). After each fired or missed reminder the handler reads the event and points `open.props.day` at the next pending occurrence's day; with none left (a one-off, or past `until`) it cancels the job instead of leaving it disarmed. It uses the job, not `due`.
- **Text.** Title the event's; message its time and how far ahead the reminder is, the same for every occurrence: "14:30–15:30 · in 15 min", "All day · tomorrow". No buttons: a snooze would fire after the handler has moved `open` on to the next occurrence.
- **Next reminder** in the status bar and on the widget is the soonest pending `calendar:` job.

## Divergence from ADR

- Job gains `armed_at` and `missed_at`; the registry loses `migrated` and there's no migration (owner follow-up, ADR-062 revision 2026-10-21).
- Added beyond the ADR's API: `missed`, `last_jump`, `triggers`, `is_leader`.
- Job gains `silent`, and apps gain the manifest's `on_fire` hook (owner follow-up, ADR-062 revision 2026-10-21).
- The missed summary says "asleep" instead of "closed" when it's found after this tab's first pass.
- The timer runs only while jobs exist and its idle wake-up lands on the minute; a leader with no jobs runs no pass on a wake-up; going hidden wakes nothing; a pending steal isn't repeated; the badge is cleared only when one is up (health pass, ADR-062 revision 2026-10-21).

## Known gaps

- The idle heartbeat runs while any job exists, armed or not: a registry of only switched-off alarms still wakes the leader once a minute (on the minute) to catch a clock change it has nothing to fire for.
- Nothing fires with every tab closed unless Triggers is on. On Android a background tab is frozen within about a minute, so only the foreground tab fires.
- With Triggers on, a job delivered by its trigger while every tab was closed is still reported missed at the next boot: the registry never heard it fired.
- Whether Chrome replaces a shown notification immediately when a triggered one with the same tag is added (rather than when it triggers) is unverified.
- An on-fire handler that throws isn't retried; the app sees the end again only through `jobs`. A leader tab closed while a handler runs leaves that occurrence unhandled (the next leader doesn't redo it).
- App files (`json_file`) don't sync across tabs. A tab with Pomodoro loaded that misses the moment a phase ended (frozen in the background on Android, say) and then sees the next phase already scheduled by the leader shows its stale plan until it reloads.
- `LatestWriter` logs a failed write instead of throwing, so `schedule()` resolves even when the file couldn't be saved; the next pass or re-read shows the truth.
- Calendar reminders count in wall time, not elapsed time: across a DST change between a reminder and its event, "1 day before" is the same clock time the day before (23 or 25 h), and "1 hour before" an event at 03:30 on a spring-forward night fires at 03:30. The old in-app check subtracted milliseconds.
- A Calendar reminder whose shifted rule the scheduler can't express isn't scheduled (above); the editor refuses it.
- A reminder created after its time has passed for the next occurrence never fires for that occurrence (`armed_at`); the old in-app check still showed it until 15 min after the event started.
- A Calendar reminder fired while the leader closes before the handler runs keeps `open` on the day it just fired for; the next reminder opens that day.
