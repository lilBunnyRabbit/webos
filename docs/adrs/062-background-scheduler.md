# ADR-062: Background Scheduler
**Date:** 2026-10-21
**Status:** Implemented

## Context
Alarms, timers, Pomodoro phases, Calendar reminders and cook timers fire only while their app's window or widget is mounted: Clock and Calendar poll from their hosts, Pomodoro holds one timeout, Recipe Box keeps timers in memory. Notification buttons are closures, which can't persist or reach a service worker, and system notifications use `new Notification()`, which Android rejects. WebOS has no backend. Discussion and platform research: [brainstorm](../brainstorm/2026-10-21_background-scheduler.md).

## Decision
**SchedulerService** (`scheduler`), depends on files, notifications, apps, shell. Swapped by nothing; solo uses the same class.

**Registry.** The only store for scheduled items: `/var/lib/scheduler/jobs.json`, zod-validated, `{ version: 1, migrated: { [app]: true }, jobs: Job[] }`.
```ts
interface Job {
  id: string;                 // "{app}:{key}"
  app: string;
  title: string;
  message?: string;
  at: { epoch: number } | { date: string; time: string; tz: string }; // one-shot absolute, or wall time in an IANA zone
  repeat?: Repeat & { until?: string; skip?: string[] };
  armed: boolean;
  snooze_until?: number;
  last_fired?: number;
  actions?: { label: string; command: string }[];   // at most 2
  open?: { app: string; props?: Record<string, unknown> };
  kind: "alarm" | "timer" | "reminder" | "phase";   // drives requireInteraction and sound
}
type Repeat =
  | { every: "day"; interval?: number }
  | { every: "week"; days: number[] }
  | { every: "month"; day: number }   // clamps to month end
  | { every: "year" };
```
API: `schedule(app, job)`, `update(id, patch)`, `cancel(id)`, `get(id)`, `list(app?)`, `next(id)`; reactive `jobs`. Apps keep only their extras keyed by job id. One pure `next_occurrence(job, after)` computes every rule in the job's zone.

**Firing.** One leader per browser via `navigator.locks` (`webos:scheduler`); a visible full tab steals it; solo tabs join but never steal. The leader keeps one unchained `setTimeout` to min(next due, 60 s), re-armed on visibilitychange, resume, pageshow, focus and registry changes; a wall-clock vs `performance.now()` check catches sleep and clock jumps. Registry writes run under a `webos:scheduler-store` lock; a BroadcastChannel ping makes other tabs re-read.

**Notifications.** Through `registration.showNotification` (tag = job id, `requireInteraction` for alarms, `data` = route and commands). `public/sw-notifications.js` is added with `workbox.importScripts`: `notificationclick` focuses a WebOS client and posts the action, or opens `base#/app/{id}?{props}`. Buttons run their shell command; the body click opens `open`. NotificationsService's system path moves to `showNotification` too, which fixes Android.

**Closed tabs.** When `showTrigger` exists (Chrome's Experimental Web Platform features flag), each due job also gets a triggered notification with the same tag; the leader replaces or cancels it when it fires first. An installed PWA badges the icon with the missed count.

**Missed.** At boot and after sleep: under 2 min late fires normally; later goes into one "N missed while WebOS was closed" notification plus notification-center entries; repeating jobs skip to their next occurrence; a Pomodoro phase shows when it ended and pauses.

**Permission and sound.** Permission is requested in the click that creates the first job; Settings › Notifications shows status, Allow and Send test. The in-page chime plays only after a click since load; otherwise the OS notification's sound carries it.

**Shell.** `sched ls` yields `columns` of a `job` value (app, title, next, repeat; click opens the app), `sched rm <job>` with a completer, a `when` arg kind; apps add their button commands.

**Migration.** Once per app, at first boot: jobs copied from the app's file into the registry, old fields left in place and ignored, `migrated` marker set.

## Alternatives Considered
- Apps keep their data behind a pull hook (`next`/`fire`/`upcoming`): one source of truth per app, but no central list; the owner chose the registry.
- Floating local time: alarms follow the traveller, events drift; the owner chose a fixed zone per job.
- A dedicated worker tick: unthrottled, but frozen with the page anyway.
- Every tab firing with tag dedupe: duplicate chimes and writes.
- `injectManifest` for a typed service worker: owning all of SW behaviour and the precache shape.
- Periodic Background Sync digest: 12–36 h timing at Chrome's discretion.
- A push backend: the only real "browser closed" delivery; breaks "no backend".

## Consequences
- Exact to ~1 s while any WebOS tab or PWA window lives on desktop; on Android only in the foreground, unless Triggers is on.
- Every edit path to an alarm or reminder (app UI, shell, restore, uninstall) must go through the registry.
- The scheduler owns Calendar's repeat semantics; Calendar's events split across two files.
- An alarm set at home rings at home time abroad (fixed zone).
- Triggers is a halted API: it can disappear in any Chrome release, and only flagged browsers get it.

## Revision 2026-10-21: service core built
- **Where a rule starts counting** (owner, follow-up below): Job gains `armed_at?: number`, set by the scheduler when a job is scheduled, re-timed or switched back on; occurrences before it never fire or count as missed, so a one-shot scheduled for a time already past never fires. `last_fired` is only ever the occurrence that really fired.
- **Time zones.** `Intl.DateTimeFormat` offsets, no Temporal (Node 24 runs the unit tests and lacks it). A wall time in a DST gap (or a skipped day) shifts forward by the gap; an ambiguous one takes its first pass. `month` and `year` clamp to the month's end (29 February fires on the 28th in other years).
- **Writes** re-read the file under `webos:scheduler-store`, apply the change and write through a `LatestWriter` before releasing; the leader's firing pass is one such write, so a handover can't fire an occurrence twice.
- **Leader.** A full tab steals when it's visible (at init and on becoming visible); hidden and solo tabs queue. The timer is re-armed after each pass's storage I/O, so Chrome doesn't count it as a chained timer.
- **Clicks.** The worker asks WebOS tabs one at a time, most recently focused first, over a `MessageChannel`, and focuses the first that takes the click: any full tab for a scheduler job, a solo tab only for its own app's body click, and for NotificationsService's notifications only the tab that sent them (their buttons are closures). Nobody takes it: it opens the route, and for a button waits for the new tab's `webos:ready` before handing the click over.
- **Missed jobs** (owner, follow-up below): Job gains `missed_at?: number`, the latest occurrence the scheduler counted as missed, written in the same registry write. The owning app reads and clears it (Pomodoro pauses and shows when the phase ended). Clearing it on a repeating job moves `armed_at` just past it, so the skipped occurrences don't come back. The in-memory `missed` list stays for the inspector.
- **No migration** (owner, follow-up below), superseding the Migration paragraph above: the registry is `{ version: 1, jobs }` with no `migrated` marker and no `migrate()`. Nobody uses the old app-file fields yet, so builders 2–4 switch the apps straight to the registry and ignore that data.
- **Uninstall** (owner, follow-up below): every full tab watches AppsService's installed list and drops, under the store lock, the jobs of an app that's registered but no longer installed. Not only the leader, because an uninstall changes only its own tab's list; never in solo, where the open app was never installed. System apps can't be uninstalled.
- **Added API:** `missed`, `is_leader`, `triggers`, `last_jump` for apps and the inspector. Permission stays `notifications.request_system()`, called in the creating click.
- **Missed** wording: "closed" on this tab's first pass, "asleep" after. The in-page chime isn't built.
- **Dev server:** no service worker, so OS notifications fall back to a page `Notification` without buttons.
- **Shell values.** Clicking a `job` value (`sched ls`) opens its `open` target, else the app.

## Revision 2026-10-21: Clock and Recipe Box on the scheduler
- **Clock** keeps alarms and timers only as jobs (`clock:alarm-{id}`, `clock:timer-{id}`); `clock.json` keeps the label, a timer's length and its time left while paused (`left_ms`), by job id. The old `alarms`/`timers` arrays are dropped on read, zones and stopwatch kept; no migration. A one-off alarm is `{ date, time, tz }` for the next time the clock reads it and is re-timed when switched back on; a weekday alarm starts today with `{ every: "week", days }`. The ringing loops (window, widget, `ring_while_timers`) are gone.
- **Buttons:** `alarm snooze <alarm> [duration]`, `alarm stop <alarm>`, `timer restart <timer>`; a timer's Stop is the existing `timer stop`, which removes it. Recipe Box adds `recipe timer stop <timer>`.
- **Recipe Box** cook timers are one-shot `timer` jobs whose body click opens the recipe (`open.props.path`); the cook-mode strip shows the open recipe's timers, done ones until cleared. Recipe Box keeps no file of its own: the job's title is the timer's name.
- **In-page chime** (Permission and sound) is played by the apps, not the scheduler: Clock's window and widget and Recipe Box's window watch their jobs' `last_fired` and chime in the leader tab after a user gesture. With none open, only the OS sound carries it. A scheduler "fired" hook or a manifest callback would be a new public API; it's an open question for the owner, not built. Superseded by the next revision: the scheduler plays it.

## Revision 2026-10-21: Pomodoro on the scheduler, chime in the scheduler
- **Chime** (owner, follow-up in the brainstorm), superseding the app-hosted chime above: the scheduler plays it. In the leader tab, when a pass fires a job of kind `alarm`, `timer` or `phase` and the page has had a user gesture since load (`navigator.userActivation.hasBeenActive`), it plays one built-in chime: a bright repeated call for alarms and timers, a soft pair for a phase. One per pass, the loudest kind, so jobs due together don't stack. `chime.ts` (Clock's, moved) loads on the first chime. Clock's and Recipe Box's `ring_while_alive` are gone. No public API.
- **Pomodoro** keeps one job, `pomodoro:phase`, kind `phase`, `{ epoch }`, armed while a phase runs. `timer.json` keeps the plan (phase, round, time left while paused, the phase's length, the end it last counted as `settled`), a missed phase's `ended` notice, settings and the task; the old `run` with its end time is dropped on read, no migration. Pause disarms the job (the time left goes to the file first), reset, skip and choose cancel it.
- **Counting a fired or missed end** runs in Pomodoro's page-level timer, in any tab that has Pomodoro loaded (window, widget, or a `pomo` command): it records the focus in `stats.json`, sets `settled`, and writes the next phase's job (auto-start) or cancels it. Every action and every `pomo` command counts first, so a button pressed long after still sees the right phase. The timer holds itself while a phase runs, so after `pomo start` or closing the window, the tab that started it still chains the auto-started phase.
- **Missed** follows the ADR: the next phase waits paused at its full length (whatever auto-start says), "Focus ended at 14:02" shows until the next action, and the app clears `missed_at` with `update(id, { missed_at: undefined })`; the disarmed job stays as the paused phase's slot.
- **Buttons** are the existing `pomo start`, `pomo pause` and `pomo skip`: Start break or Start focus plus Skip, or Skip break / Pause when the next phase starts by itself. The notification's text follows settings and task changes while a phase runs (an update after 0.8 s).
- **Pomodoro's Sound switch is gone**: the scheduler always chimes for a phase after a gesture; there's no per-job mute (that would be a Job field).
- **Open: auto-start with Pomodoro loaded nowhere.** When no tab has Pomodoro loaded (a reload after starting, or the starting tab closed), a fired phase is only counted, and the auto-started next phase scheduled, when Pomodoro next loads; its notification already said "Short break started", but the break's end doesn't ring, and if it would already be over it waits idle (the old rule). Fixing it needs app code at fire time: a scheduler fired hook or a `define_app` on-fire hook, both new public API, left to the owner.

## Revision 2026-10-21: on-fire hook and per-job mute
Owner follow-ups in the brainstorm, closing the "auto-start with Pomodoro loaded nowhere" question above.
- **`define_app({ on_fire })`**: `() => import("./on-fire")`, the module default-exporting `OnFire = (job, { outcome: "fired" | "missed", due }) => void | Promise<void>`. The leader loads it on first use and calls it once per fired or missed occurrence, after the notification (and the missed summary), with the job as the registry holds it after the pass. Handlers run one at a time on their own queue, off the pass, so a slow one never holds the timer. A throw is logged and toasted from the app, never retried, never breaks the scheduler. Nothing joins the boot chunk. Rejected: an `on_fired` subscription on the scheduler (needs the app's code loaded to subscribe); leaving the gap. Not on the stable app API yet, since `Job` isn't.
- **Pomodoro** counts an end and chains the next phase in its handler, through the same page-level timer its window and commands use, so `plan.settled` stops a second count in that tab. The timer no longer holds itself while a phase runs. Superseding the "Counting" and "Open" paragraphs of the previous revision: an auto-started break rings its own end with Pomodoro closed everywhere, and a phase missed while WebOS was closed is paused at the next boot.
- **`silent?: boolean`** on Job: the scheduler plays no in-page chime for it; the OS notification follows the system's settings. Pomodoro's Sound switch is back (off by default), so its phase jobs are silent unless it's on; "Play the chime" next to it plays the scheduler's phase chime. Superseding "Pomodoro's Sound switch is gone" above.

## Revision 2026-10-21: Calendar on the scheduler
All four alerting apps are on the registry. Calendar's `remind_while_alive` loops (window and widget) and the event's `last_notified` are gone; no migration.
- **One job per event with a reminder**, `calendar:reminder-{event id}`, kind `reminder`. `at` is the first occurrence's reminder as `{ date, time, tz }`, in the device's zone when it's made: the event's start (09:00 all day) minus the reminder's minutes, carried onto earlier days. The job's rule is the event's rule moved back by those whole days (`shift`), with `until` and `skip` moved the same, so the scheduler owns the repeat as decided. `events.json` keeps every detail and nothing about firing.
- **Shift checked, never approximated.** A shifted monthly or yearly rule is verified against `next_occurrence` over 48 months or 8 years. Where month-end clamping or 29 February makes it miss (a day ahead of an event on the 29th–31st, a week ahead of the 1st–7th, a day ahead of 29 February, or of 1 March from a non-leap year), nothing is scheduled, and the editor and `cal add` refuse that reminder with the reason. **Open for the owner:** how to schedule those. A lead time on Job (`before` minutes off each occurrence of the event's own rule) makes every combination exact and drops the shift; the way without new API is a one-shot job per occurrence, re-timed in `on_fire`.
- **Wall time, not elapsed time.** The minutes come off the wall clock, so "1 day before" keeps its clock time across DST (23 or 25 h), and "1 hour before" 03:30 on a spring-forward night lands in the gap and fires at 03:30. The old check subtracted milliseconds. A lead time on Job would restore elapsed time.
- **`on_fire`** keeps a repeating reminder's body click (`open.props.day`) on the next occurrence's day, since a job's `open` is fixed, and cancels the job when no occurrence is left instead of leaving it disarmed. It re-reads the job from the registry (an edit may have rescheduled it meanwhile) and ignores `due`. The shape held for a second app: nothing in it had to change.
- **No buttons.** A `cal snooze` button was left out: by the time it's pressed, the handler has moved `open` on to the next occurrence, so a snoozed repeat would open the wrong day, and the message's "in 15 min" would be wrong after a snooze.
- **Every edit path** (Save, delete one occurrence, delete, `cal add`) calls `sync_reminder`: the same wall time and rule only updates the title and message, keeping the zone and `armed_at`; anything else schedules afresh; no reminder, or none left from now on, cancels. Uninstall is the scheduler's.
- **Behaviour change:** a reminder whose time has already passed when it's saved doesn't fire for that occurrence (`armed_at`); the old check still showed it up to 15 minutes after the event started.

## Revision 2026-10-21: idle work (health pass)
The first health pass measured the scheduler as the only new idle cost: one wake-up, one lock and three OPFS reads a minute with no jobs at all, and a lock plus reads on every window focus. Owner's decisions in [the health pass](../brainstorm/2026-10-21_health-pass.md):
- **Timer only while jobs exist**, superseding "min(next due, 60 s)" in Firing for an empty registry: with no jobs the leader keeps no timer, and a wake-up (focus, resume, pageshow, becoming visible) runs no pass. The first `schedule()`, a re-read or another tab's ping runs a pass, which arms it again.
- **Heartbeat on the minute.** With jobs, a due occurrence less than 60 s away sets the timer; otherwise it's armed to the next minute boundary (`60 s - now % 60 s`, as the taskbar clock does), so a hidden tab's wake-up shares the clock's. Still a one-shot re-armed after each pass's I/O, never chained.
- **No double steal, no pass on hidden.** Becoming visible fires visibilitychange and focus together; a steal still pending isn't requested again. visibilitychange to hidden does nothing.
- **Badge.** `seen` is broadcast and `clearAppBadge` called only when a badge is up. Built within scope: the leader posts `{ type: "badge", count }` on the channel when it sets one, so any tab knows; a visible boot still clears unconditionally, because an installed app keeps its badge after the tab that set it closed.
- **One read at boot.** The folder-revision effect's first run only subscribes.
- `phase` is documented as a generic timed phase, not Pomodoro's; no behaviour change.
- Leadership, the store lock and steal rules are otherwise unchanged. Not done: stopping the heartbeat when jobs exist but none is armed (left as a known gap; closed 2026-10-22, below).

## Revision 2026-10-22: no heartbeat with nothing armed
Owner's call in [owner calls](../brainstorm/2026-10-22_owner-calls.md): `arm()` sets no timer when no job has a next occurrence (every job switched off), same as an empty registry. Switching a job on runs a pass, which arms it. Accepted: a hand edit of `jobs.json` while nothing is armed isn't read until a schedule, a ping or a re-read.

## Revision 2026-10-22: on the stable app API
`schedule`, `update`, `cancel`, `get`, `list`, `jobs`, the `Job` types and the manifest's `on_fire` are stable from 3.57. `Job` can still gain optional fields in a minor (the Calendar lead-time question). Decided in [owner calls](../brainstorm/2026-10-22_owner-calls.md); listed in [app API](../system/app-api.md).
