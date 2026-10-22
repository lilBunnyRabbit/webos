# Owner calls: uninstall hook, scheduler heartbeat, service worker, prompt danger
**Date:** 2026-10-22
**Participants:** owner, Claude

## Context
Four items left open by earlier sessions:
- Moonrabbit's device key and quick-unlock records live in IndexedDB `webos.moonrabbit`. `AppsService.uninstall(id, { data: true })` only clears `app.{id}.*` localStorage and `/var/lib/apps/{id}`, so they survive ([moonrabbit](2026-10-22_moonrabbit.md)).
- The scheduler leader wakes once a minute while any job exists, even when every job is switched off (ADR-062 known gap).
- The service worker was parked after the owner declined workbox devDependencies for the built `injectManifest` branch (997552b4) ([health pass](2026-10-21_health-pass.md)). The Burrow stale-font bug waits on it.
- `PromptOptions` has no `danger`; Moonrabbit's typed-name delete step shows a neutral confirm button.

## Decisions
- **Uninstall hook (decided).** New lazy manifest field `on_uninstall_data: () => import("./uninstall")`, default-exporting `() => Promise<void>`, the `on_fire` pattern. Runs after the OS clears localStorage and `/var/lib/apps/{id}`, only with `data: true`. A throw is logged and reported, uninstall still completes. Moonrabbit deletes `webos.moonrabbit`. Not on the stable app API yet. Rejected: a naming convention (`app.{id}` databases deleted by the OS; needs a device-key migration for Moonrabbit); leaving it.
- **Heartbeat (decided).** `arm()` sets no timer when `next_due` is `null`, same as no jobs. Switching a job on runs a pass and re-arms. Accepted: a hand edit of `jobs.json` with every job off isn't picked up until another event. Rejected: keeping the heartbeat as accepted cost.
- **Service worker (decided).** Keep `generateSW` and no new dependencies. Port the small fixes from the branch: hashed Burrow font URLs, mammoth out of the precache with a CacheFirst runtime cache, the import-map `\0` identity fix, reload when the browser already installed the update. Rejected: a hand-written worker (most risk); the built branch (six workbox devDependencies); staying parked. Accepted: no parallel install, a long gap still takes ~30 s.
- **Prompt danger (decided).** `PromptOptions.danger`: red confirm button; the input keeps the initial focus. Moonrabbit's typed-name delete uses it. Rejected: leaving the step neutral.
- **Stable app API (decided).** From 3.57, all additive (a minor): `report_error` and `Flash` (kit); `tasks.run` with its own types, the task-manager package promised at its pinned version; every AiService call apps use (`features`, `availability`, `summarize`, `translate`, `detect`, `prompt`, `extract`, `measure`), despite Chrome's API being experimental; the scheduler's `schedule`, `update`, `cancel`, `get`, `list`, `jobs` with the `Job` types and `on_fire`; `on_uninstall_data` despite one user. `jobs` joined the list by the two-app rule (Clock, the Clock widget). Rejected: keeping AI internal until Chrome ships it stable (recommended; owner chose all); waiting for the Calendar lead-time call before freezing `Job` (optional fields stay possible). Pinned in `src/lib/core/app-api.test.ts`.
- **Swipe on a non-dismissible sheet means Cancel (decided, owner).** On phones, swiping down a confirm sheet (window confirm, desktop delete, `sudo` elevation, save changes) resolves it as Cancel instead of rubber-banding. Sheets where dismissing would silently pick a real answer (session restore, first-boot intro, file conflict, whose null is "skip") keep rubber-banding. Esc and the outside click stay blocked on desktop.
- **Calendar reminders whose day moves with the month (owner: "idk you decide"; Claude's call).** `Job` gains optional `before` (minutes): each occurrence of the rule fires that much earlier, on the wall clock in the job's zone, so "1 day before 09:00" stays 09:00 across DST as today. Calendar's job becomes the event itself (`at` = the event's start, 09:00 all day; the event's own rule, `until`, `skip`); the shift and its refusals go. Additive on the stable `Job` (optional field, a minor). Rejected: a one-shot job per occurrence re-timed in `on_fire` (a missed or failed handler ends the chain; Triggers can't pre-schedule the next one); elapsed-time lead (changes today's DST behaviour).
- **Shell:** nothing new for any of the four (no `app uninstall` command exists today).

## Key takeaways
- Small fixes ship together; the service worker ships alone (push grouping).

## Action items
- [x] `on_uninstall_data` + Moonrabbit hook, heartbeat, prompt danger: one release.
- [x] Service worker fixes on `generateSW`: its own release.

## Next session topics
- An `app uninstall` shell command.
