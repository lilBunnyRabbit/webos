# ADR-065: Apps on Demand, Offline by Choice
**Date:** 2026-10-22
**Status:** Implemented

> **Revision 2026-10-26: the Portfolio path ([solo stale-build brainstorm](../brainstorm/2026-10-26_solo-stale-build.md)).**
> `/webos/portfolio/` is a copy of `index.html` the worker never precaches or serves (`globIgnores`, `navigateFallbackDenylist`), so the public Portfolio link always boots the deployed build instead of the one cached before the last deploy. It's the one path that isn't offline-first. Details in [offline.md](../system/services/offline.md#service-worker).

> **Revision 2026-10-22: implementation.**
> - Each list is `{ build, files }`: a tab still running an older build would otherwise fetch the newer build's list and save its files under its own cache. A list from another build fails that app's task with "WebOS was updated…".
> - "Other tabs follow the state file's revision": FilesService revisions are per tab, so another tab's saves are read when a tab becomes visible, and a sync re-reads the file once it holds the lock. No BroadcastChannel.
> - OfflineService also depends on `windows`: an app's first open in a build is seen as a window appearing (launch, restore, deep link).
> - The `/assets/` rule matches with `ignoreVary`: the preview server answers `Vary: Origin`, and a module import then missed files the page had stored itself. A file the update didn't rename is copied from the previous build's cache (`caches.match`) instead of downloaded.
> - Older `webos-assets-*` caches are deleted only once nothing picked is left to save, so a retry can still copy from them; after an update with nothing picked, they go on the first idle moment.
> - The window menu entry is the taskbar item's right-click menu (desktop). Phones have no window menu; the drawer's long press has it.
> - Measured: precache 844 entries (12.4 MB) → 305 (4.2 MB); 80 app lists of 3 to 42 files; a preview update with one app changed installed 9 files and reloaded in about 2 s.

## Context
The service worker precaches every file the build makes: 833 files, 4.9 MB gzipped, every app, section and dialog (`vite.config.ts` `globPatterns`). workbox-precaching installs them one at a time, so an update that renames a few hundred files keeps the update screen up for minutes on a phone (3.48.0 → 3.57.0: 175 of 319 files in 88 s, then the 120 s fallback threw them away and the fresh worker downloaded all 833 again in the background).

That came from a 2026-10-15 promise that every app works offline, reaffirmed in [2026-10-21_slow-updates](../brainstorm/2026-10-21_slow-updates.md). The owner reversed it: apps load on demand, always, and the platform must stay as fast with a million apps as with ten. Discussion: [2026-10-22_on-demand-apps](../brainstorm/2026-10-22_on-demand-apps.md).

## Decision

**Scale rule.** Boot, updates and background work never cost more with more apps installed. Cost follows the apps a user picks or opens.

**Precache = core + system apps.** The worker's install precaches only the shell, kernel, boot chunks, fonts and the system apps' files, so an update installs in seconds. Still `generateSW`: a `manifestTransforms` entry keeps only the files listed in `offline/core.json`.

**Everything else on demand.** `/assets/` is runtime-cached CacheFirst in `webos-assets-{build}`, a cache per build. Whatever loads is cached.

**Per-app file lists.** The build writes `offline/{id}.json` for every user app (every chunk and CSS file its window can reach, sections and dialogs included, from Vite's module graph) and `offline/core.json`. Nothing reads a list for an app that isn't picked or opened.

**OfflineService (`offline`).** New kernel service, depends on files, apps, tasks and notifications.
- `picked`: apps the user keeps offline, in `/etc/offline.json` (`{ version: 1, apps: [...] }`, part of backups). A fresh install picks none. System apps are always kept and are not in the list.
- `saved`: apps whose whole list is in this build's cache, in `/var/lib/offline/state.json` (`{ build, apps: [...] }`); a new build resets it. Held in memory as a set, so `is_saved(id)` is a lookup.
- `sync()`: after an update reload, and when an app is ticked, downloads the picked apps' lists as one task (TasksService: one task per app, files in parallel, progress toast, Cancel, Retry). Only the tab holding the Web Lock `webos.offline.sync` runs it; other tabs follow the state file's revision.
- First open of an unpicked app in a build quietly downloads its whole list (no toast) and adds it to `saved`, so it works offline until the next update.
- After a sync finishes, older `webos-assets-*` caches are deleted.

**Update screen.** Same overlay, waiting only for the core install, then reload. Picked apps follow in the background.

**Offline launcher.** While offline, apps not in `saved` are dimmed, with a note saying why and pointing to Settings › Offline. Opening one shows the same message.

**Ways in.** Settings › Offline (searchable list, picked first, status per app, only visible rows rendered), "Keep offline" in the launcher's context menu and in the window menu. No shell commands.

**Migration.** The first update to this starts with nothing picked; the old full precache is dropped by Workbox's cleanup. A one-time toast says apps now load when opened, with "Choose apps" opening Settings › Offline.

## Alternatives Considered
- **Keep precaching everything, install in parallel** (custom `sw.ts`): faster, but updates still grow with the app count. Breaks the scale rule.
- **Merge small chunks** (`experimentalMinChunkSize`): fewer files, same growth with the app count.
- **One `offline.json` for all apps:** grows with every app.
- **Record loaded files at runtime:** every hash changes on update, so the record is stale.
- **One runtime cache pruned by list, or expiration by count:** pruning needs every app's list; expiration can evict a picked app.
- **Trusting the browser's HTTP cache:** GitHub Pages sends `max-age=600`, the cache is evictable, and it holds only what loaded.
- **Picked + recently opened, or every app picked by default:** unpredictable, or today's cost moved to the background.

## Consequences
- An update installs in seconds; the overlay no longer waits on apps.
- An app that is neither picked nor opened since the last update does not open offline. That is the trade.
- A new kernel service with an inspector, a system reference page and a Settings section.
- The build gains a plugin that writes `offline/*.json`.
- Still open, under the same scale rule: the app registry, `app-meta` (ADR-049) and `app-boot` load every app's text, icon and props at boot. Separate decision.
- Supersedes the "every app works offline" promise: ADR-004 and ADR-036 get revision notes when this is built.
