# Background scheduler
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
Owner: "Start working on background scheduler. This needs to be perfect. What technologies we use". Roadmap item from 2026-10-14: alarms, timers, Pomodoro phases and Calendar reminders fire only while their app's window or widget is alive.

Two investigate-only reports.

Codebase:
- Clock rings from a 1 s interval per host (`clock/ringer.svelte.ts:151`), Calendar from a 5 s interval (`calendar/store.svelte.ts:71`), Pomodoro from one timeout (`pomodoro/timer.svelte.ts:22`); Recipe Box timers live in memory only. `alarm add` from the shell never rings without a Clock window.
- Notification actions are closures (`notifications/type.ts:15`), so they can't be persisted or run by a service worker. System notifications use `new Notification()` (`notifications/service.svelte.ts:67`), which throws on Android, and show no buttons.
- No cross-tab code anywhere (no BroadcastChannel, no Web Locks). The PWA is a plain `generateSW` (`vite.config.ts:61`).

Platform (Chromium source on `main`, Chrome docs, MDN, read 2026-10-21):
- Hidden tab on desktop: an unchained one-shot `setTimeout` fires within ~1 s; intensive throttling (1/min) hits chained timers after 60 s hidden. Pages with notification permission or in a PWA window are not proactively discarded.
- Android freezes background pages after ~1 min: nothing fires.
- A service worker is stopped after 30 s idle: it can't be the clock, only handle clicks.
- Notification Triggers (`showTrigger`): development halted in 2019, still in Chromium behind Experimental Web Platform features; would fire with every tab closed (Android: with Chrome closed). Unverified on the owner's Chrome.
- Periodic Background Sync: 12 h minimum. Push: needs a server.

## Topics discussed
### Who owns the schedule (decided)
Central registry: `scheduler.schedule(app_id, { key, at, repeat, title, actions })` stored by the scheduler in `/var/lib/scheduler/`, which fires by itself. Owner picked it over the recommended pull hook (apps keep their data, the scheduler asks `next()`). Accepted cost: a second copy of each alarm next to the app's file, so every edit path (shell, file edits, restore, uninstall) must go through the registry, and repeat rules (weekdays, Calendar's monthly/skip/until, DST) live in the scheduler.

### Clock and cross-tab (decided)
Web Locks leader (`webos:scheduler`); a visible tab steals leadership. One unchained `setTimeout` to min(next due, 60 s), re-armed from visibilitychange, resume, pageshow, focus and registry changes; wall clock vs `performance.now()` catches sleep and clock jumps. BroadcastChannel pings other tabs when the registry changes. Writes under a `scheduler-store` lock. Rejected: a dedicated worker tick (frozen with the page anyway); every tab firing with tag dedupe (chimes and writes once per tab).

### Service worker code (decided)
Keep `generateSW`; add `public/sw-notifications.js` through `workbox.importScripts`: `notificationclick` focuses a client and posts the route, or opens `base#/app/...`. System notifications move to `registration.showNotification` (fixes Android, real action buttons). Rejected: `injectManifest` (owning the whole SW, precache parser must follow).

### Guarantee (open)
Owner asked: "can we do anything with service workers/pwa anything?"
Answer: a service worker can't keep time (stopped after 30 s idle); it only handles clicks. The one SW API that fires with everything closed is Notification Triggers, behind the flag. An installed PWA is never proactively discarded, can badge the icon, and can run Periodic Background Sync (12 h+, a digest at most).

Decided: live tab plus Triggers plus PWA extras. Exact to ~1 s while any WebOS tab or PWA window lives; when `showTrigger` exists, each job also gets a triggered notification with the same tag, so it fires with every tab closed; the leader cancels or replaces it when it fires first. Installed PWA: `setAppBadge` with the missed count. Rejected: a daily digest through Periodic Sync (timing up to Chrome); standard APIs only.

### Data (decided)
The registry is the only store for scheduled items: time, repeat, armed, snooze, last_fired move out of `clock.json`, Pomodoro's `timer.json` and Calendar's events into `/var/lib/scheduler/jobs.json`. Apps read and write through the service and keep only their extras (labels, event details) keyed by job id. One-time migration at boot. Accepted cost: Calendar events split across two files; the scheduler models Calendar's repeat rules (monthly/yearly clamping, skip, until). Rejected: apps mirroring into the registry (two copies drift); registry for new jobs only (leaves the bug in Clock, Calendar, Pomodoro).

### Actions (decided)
`{ label, command }` shell command strings run through ShellService, like OS shortcuts; the default click opens `#/app/{id}?{props}`. At most 2 buttons (Chrome's limit). New commands needed for buttons (alarm snooze/stop, timer restart, pomo actions). Rejected: fixed built-in verbs (apps can't add their own).

### Missed (decided)
Under 2 min late fires normally; later goes into one "N missed while WebOS was closed" notification plus notification-center entries. Repeating jobs skip to their next occurrence, no backfill. Pomodoro shows "phase ended at 14:02" and pauses. Rejected: per-job grace; firing everything.

### Consumers (decided)
All four alerting apps in v1: Clock alarms and timers (fixes `alarm add` from the shell not ringing), Pomodoro phases, Calendar reminders, Recipe Box cook timers. Later: Kanban due dates, a generic `remind`.

### Time zones (decided)
Fixed zone per job: each job stores an IANA zone; its next occurrence is computed in that zone, so a Calendar event keeps its real moment when the device travels. Owner picked it over floating local time. Consequence: an alarm set at home rings at 07:00 home time abroad. One-shot timers store an absolute epoch.

### Solo (decided)
Solo tabs run the same scheduler and join the lock, can lead when no full tab exists, never steal from a full tab. A click for another app opens full WebOS (`#/app/...`).

### Shell (decided)
`sched ls` yields `columns` of a new `job` value (app, title, next, repeat), a row click opens the owning app; `sched rm <job>` with a job completer. Button commands in the apps: `alarm snooze|stop`, `timer restart`, `pomo skip`. A `when` arg kind ("10m", "18:30", "tomorrow 9:00"); Clock's parsers move into core.

### Repeat rules (decided)
Own zod JSON rule: `{ every: "day", interval? } | { every: "week", days } | { every: "month", day } (clamps to month end) | { every: "year" }`, plus `until?` and `skip?`. One pure tested `next_occurrence(job, after)` computed in the job's zone. Rejected: an RFC 5545 RRULE subset (a parser for far more than we use; revisit for .ics import).

### Permission and sound (decided)
Creating the first job (a click) requests notification permission in that click. Settings › Notifications shows the status, Allow, and Send test. The in-page chime plays only after the page has had a click since loading; otherwise the OS notification's sound carries it. Rejected: asking at first boot.

### Build (decided)
Four builders in sequence, each merged and checked before the next: 1. service core (registry, schema, `next_occurrence`, Web Locks leader, timer, BroadcastChannel, missed summary, SW notifications with click routing, Triggers, badge, `sched` commands, Settings row, inspector, docs); 2. Clock alarms and timers plus Recipe Box; 3. Pomodoro; 4. Calendar.

### Migration (decided)
Once per app at first boot with the scheduler: jobs are copied into `jobs.json`, the old fields stay in the app file but are ignored; `migrated: { clock: true }` stops re-runs. Leftovers removed in a later release. Rejected: migrate and strip in one write (no way back from a bug).

## Follow-up 2026-10-21
Builder 1 stopped on four questions the ADR didn't answer; the owner decided them after the core was built.

### Where a rule starts counting (decided)
`armed_at?: number` on Job, set by the scheduler when a job is scheduled, re-timed or switched back on; occurrences before it never count. `last_fired` is only set by a real fire. Rejected: reusing `last_fired` as the start marker (what builder 1 first built): a never-fired job carried a `last_fired`, and Clock's own model already had `armed_at`.

### Uninstall (decided)
The scheduler watches the installed apps list and cancels the jobs of a user app that was removed; system apps never uninstall. Rejected: AppsService calling the scheduler on uninstall (AppsService can't depend on it, the scheduler depends on apps).

### Migration (decided)
None. Owner: "We dont need migration no one uses it yet". The `migrated` marker and `migrate()`/`migrated()` are gone; builders 2–4 switch the apps straight to the registry and ignore old app-file data. Rejected: a once-per-app migration at boot, which also needed a way to run an app's code at boot (a `define_app` hook).

### Missed jobs (decided)
`missed_at?: number` on Job, written when the scheduler counts a job as missed; the owning app reads and clears it (Pomodoro uses it to pause and show "ended at"). Rejected: deriving it from `last_fired` against `at`, and the in-memory `missed` list alone (gone after a reload, and only in the leader tab).

### Chime (decided)
Builder 2 left the in-page chime to the apps (Clock and Recipe Box watched `last_fired` from their windows), so nothing chimed with the app closed. Owner: the scheduler plays it, per kind, in the leader tab after a user gesture; Clock's and Recipe Box's app-hosted chime is removed and Pomodoro gets none, so it never doubles. Rejected: an `on_fired` subscription on the scheduler, a `define_app` on-fire hook, the OS notification's sound only.

### Pomodoro auto-start with Pomodoro loaded nowhere (decided)
Builder 3: a phase end is counted and an auto-started next phase scheduled by Pomodoro's page-level timer, in any tab where Pomodoro is loaded; the starting tab keeps it loaded while a phase runs. With Pomodoro loaded in no tab (reload, starting tab closed), the end rings but the next phase is scheduled only when Pomodoro next loads, so an auto-started break doesn't ring its end. Closing it needs app code at fire time.

Decided (owner, 2026-10-21): a `define_app` on-fire hook. The manifest gains `on_fire?: () => Promise<{ default: (job, ctx) => void | Promise<void> }>`, lazy like `shell` and `badge`, nothing added to the boot chunk. When the leader fires a job, or counts it as missed, it lazy-imports the app's handler and calls it with the job and whether it fired or was missed, after the notification. Errors are caught and logged or toasted and never break the scheduler. Pomodoro counts the ended phase and chains the auto-started next one in its handler, so both work with nothing of Pomodoro loaded; counting stays idempotent through the plan's `settled` marker, so the handler and an open window never count one end twice. Calendar (builder 4) can use the same hook for reminders. Rejected: an `on_fired` subscription on the scheduler (the app's code must be loaded to subscribe); leaving the gap.

### Per-job mute (decided)
Builder 3 removed Pomodoro's Sound switch because the scheduler chimed for every phase and a Job had no mute. Owner, 2026-10-21: Job gains `silent?: boolean`; the scheduler skips its in-page chime for silent jobs, and the OS notification follows the OS's settings. Pomodoro's Sound switch returns, off by default as before, so its phase jobs are silent unless Sound is on, with its "Play the chime" button.

Built the same day: see the ADR revision "on-fire hook and per-job mute". The handler's argument also carries `due` (the occurrence), for a reminder app with repeating jobs. `on_fire` is listed in the app API as not yet stable, since `Job` isn't on the stable surface.

## Key takeaways
- Nothing can fire with every tab closed except the flagged Triggers API; the scheduler says so honestly and summarises what it missed.
- One store, one leader, one timer, one place that knows repeat rules.
- Buttons are shell commands, so they survive reloads and work from the service worker.

## Action items
1. [x] Builder 1: service core (ADR-062). Done 2026-10-21; decisions it had to make are in the ADR's revision note.
2. [x] Builder 2: Clock alarms and timers, Recipe Box. Done 2026-10-21; see the ADR revision. Open: who plays the in-page chime with no app window open (a scheduler fired hook or a manifest callback, both new API).
3. [x] Builder 3: Pomodoro. Done 2026-10-21; see the ADR revision. The scheduler plays the chime for every app (owner).
4. [x] Follow-up: `define_app` on-fire hook, Pomodoro counting and chaining in it, per-job `silent` and Pomodoro's Sound switch back. Done 2026-10-21.
5. [ ] Builder 4: Calendar (reminders can use `on_fire`).

## Next session topics
- Kanban due dates and a generic `remind` command.
- Removing migrated leftovers from app files.
- .ics import (would bring RRULE).
- A tiny push backend if the owner ever accepts one.

### on_fire stability and cross-tab app data (decided)
`on_fire` stays internal ("not yet stable" in app-api.md) until Calendar has used it; then the shape (and the `Job` type it receives) is promised. Rejected: stable from 3.38.
App data files not syncing between tabs (an app open in one tab can show a stale view after another tab's leader or `on_fire` handler wrote) goes onto the ROADMAP under Cross-tab file sync, fixed for every app at once. Rejected: a Pomodoro-only staleness check; leaving it.
