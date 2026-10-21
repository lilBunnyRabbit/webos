# ADR-062: Background Scheduler
**Date:** 2026-10-21
**Status:** Implemented (service core; Clock, Recipe Box, Pomodoro and Calendar not moved onto it yet)

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
