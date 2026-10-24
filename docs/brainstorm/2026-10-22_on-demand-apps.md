# Apps on demand, offline by choice
**Date:** 2026-10-22
**Participants:** owner, Claude

## Context
Owner, updating 3.48.0 → 3.57.0 on a phone: the update screen sat at "175 of 319 files · 88 s" and then fell back to clearing and reloading. "this is not acceptable to wait more than 3 min for an update of a web app."

Investigation:
- The precache holds 833 files (4.9 MB gzipped, median 2.7 KB, 653 under 10 KB): every app, section, dialog and font (`vite.config.ts` `globPatterns: **/*.{js,mjs,css,html,woff2}`).
- workbox-precaching 7.3.0 installs one file at a time (`PrecacheController.install`, "Cache entries one at a time", Workbox issue #2528). About 0.5 s per file on the phone, so the cost is the number of requests, not the bytes.
- At `INSTALL_LIMIT` (120 s) the update unregisters the worker, deletes the caches (throwing away what already landed) and reloads; the fresh worker then precaches all 833 files again in the background.

Owner: "Apps should be on demand ALWAYS. what was loaded should be cached." and "the platform can contain a million apps and that should not affect any load time or anything".

This reverses "On demand: keep precaching everything" in [2026-10-21_slow-updates](2026-10-21_slow-updates.md) and the 2026-10-15 offline promise (every app works offline).

## Topics discussed

### Scale rule (decided)
Nothing at boot, at update or in the background may cost more with more apps installed. Cost follows the apps a user picks or opens.

### What an update downloads (decided)
The service worker install precaches only the core (shell, kernel, boot chunks, fonts) and the system apps, so it takes seconds and the new version takes over. User apps load on demand; whatever loads is cached.

### Apps kept offline (decided)
A Settings list of apps to keep offline. After each update their new files download in the background while WebOS stays usable. System apps are always kept. A fresh install ticks none. Rejected: picked + recently opened (unpredictable, more data); picked only with system apps on demand (Settings may not open offline); every app ticked by default (today's cost, just moved to the background).

### Per-app file lists (decided)
The build writes `offline/{id}.json` per app, plus `offline/core.json`, from Vite's module graph: every chunk and CSS file the app's window can reach, sections and dialogs included. The background task fetches only the picked apps' lists. Rejected: one `offline.json` (grows with every app); recording what loaded at runtime (every hash changes on update).

### Downloader (decided)
The page, as a task (TasksService): one task per app, files in parallel, progress toast, Cancel, Retry, Activity Monitor row. The service worker stays `generateSW` and caches `/assets/` with CacheFirst. Rejected: a custom `sw.ts` (injectManifest).

### Cleanup (decided)
Runtime cache per build, `webos-assets-{build}`. When the background task finishes, older `webos-assets-*` caches are deleted in one pass. Rejected: pruning one cache by list (needs every app's list); expiration by count (can evict a picked app).

### Opening an app that isn't saved, offline (decided)
The launcher dims apps that aren't saved while offline, with a note telling the user why and where to choose apps (owner: "and some kind of note so that the users know"). "Saved" is an in-memory set (synced picked apps + apps opened this build), so each tile is a set lookup. Rejected: a toast on launch only.

### Shell (decided)
Nothing. Settings only.

## Next session topics
- **The app registry at boot grows with the app count.** `apps/index.ts`, the `app-meta` chunk (ADR-049) and `app-boot` carry every app's text, icon and props, and all load at boot. Under the scale rule this needs a paged catalog for the launcher and search. Separate grill.

## Round 3 decisions
- **Owner:** a new `offline` service (OfflineService). Rejected: inside VersionService (second job), inside AppsService (mixes caching into launch).
- **Storage:** picked list in `/etc/offline.json` (backed up); saved set in `/var/lib/offline/state.json` `{ build, apps }`, reset by a new build. Rejected: a SettingsService field; reading the saved set from Cache Storage (a lookup per app).
- **Ways in:** Settings › Offline, launcher context menu "Keep offline", window menu "Keep offline".
- **Update screen:** same overlay, core only, then reload; picked apps follow as a background task.
- **Opened apps:** the first open of an unpicked app in a build quietly downloads its whole list, so it counts as saved until the next update. Owner asked whether the browser caches it anyway: not reliably (GitHub Pages `max-age=600`, evictable, only what loaded).
- **Migration:** existing installs start with nothing picked, plus a one-time toast with "Choose apps".
- **Two tabs:** one tab syncs, through the Web Lock `webos.offline.sync` (the scheduler's pattern).

## Key takeaways
- Updates stop scaling with the app count; offline becomes a per-app choice.
- The registry at boot is the next thing that breaks the scale rule.

## Action items
- [x] ADR-065 written (Accepted).
- [x] Build: offline lists plugin, precache filter, per-build runtime cache, OfflineService + inspector, Settings › Offline, launcher dim + note, context and window menu entries, migration toast. Docs: system page `services/offline.md`, version page, overview Build & deploy, ADR-004 and ADR-036 revision notes, CLAUDE.md service table, ROADMAP, changelog.
