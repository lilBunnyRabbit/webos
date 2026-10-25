# OfflineService

Key `offline` · Depends on: `files`, `apps`, `tasks`, `notifications`, `windows` · ADR: [ADR-065](../../adrs/065-apps-on-demand.md), [ADR-071](../../adrs/071-split-color-games.md) · Source: `src/lib/core/api/services/offline/`, `vite-plugin-offline.ts`, `src/lib/core/components/apps/offline-{actions.ts,note.svelte}`, Settings `sections/offline.svelte` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Decides which user apps work offline. The service worker precaches only the core and the system apps, so an update installs in seconds whatever the number of apps ([version › Service worker](version.md#service-worker)). Every user app loads on demand into a per-build runtime cache. This service downloads an app's whole file list into that cache in two cases: the user picked it (Settings › Offline, "Keep offline" in the launcher and window menus), or the user opened it in this build. Both then open offline until the next update; picked apps are downloaded again after every update, opened ones aren't.

The scale rule (ADR-065): nothing here costs more with more apps installed. Boot reads two small files, `is_saved` is a set lookup, and only picked or opened apps' lists are ever fetched.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `online` | `boolean` | `$state`, `navigator.onLine`, kept by `online`/`offline` events |
| `picked` | `ReadonlySet<AppId>` | `SvelteSet`, user apps only, from `/etc/offline.json` |
| `syncing` | `boolean` | `$state`, true while this tab runs a sync job |
| `is_picked` | `(id) => boolean` | |
| `is_saved` | `(id) => boolean` | Saved in this build, or a system app |
| `can_open` | `(id) => boolean` | `online \|\| is_saved(id)`: what the launcher dims on |
| `status` | `(id) => OfflineStatus` | `system` \| `saved` \| `downloading` \| `not-saved` |
| `set_picked` | `(id, keep) => void` | Writes `/etc/offline.json`. System and unknown apps are ignored. Ticking an app that isn't saved calls `sync()` |
| `sync` | `() => Promise<void>` | See [Sync](#sync). Never throws; a no-op in dev |

## Build: the file lists

`vite-plugin-offline.ts` (`offline_plugin(build)`, registered in `vite.config.ts` after the import map) runs in `writeBundle`, so it sees final file names (core renamed after the import map), before vite-plugin-pwa writes `sw.js` in `closeBundle`.

- **Roots.** For each `src/lib/apps/user/{id}/index.ts`, the chunks of every module its manifest `import()`s: the component, `commands`, `highlights`, `preview`, `widget`, `on_fire`, `on_uninstall_data`. Chunks named `core`, `app-boot` or `app-meta` are never roots.
- **Edges.** A chunk's `imports` and `dynamicImports`, its `importedCss` and `importedAssets`, and the hashed file names its code mentions that are assets (worker scripts, `?url` files). Vite's `__vite__mapDeps` preload table is stripped first: it lists every `import()`'s deps, user apps' included. Assets (worker bundles, CSS) are scanned for hashed names too.
- **Core** (`offline/core.json`): everything `index.html` and the entry reach without entering a root. That is the shell, `core`, `app-boot`, `app-meta`, the fonts the CSS names, and every system app with its lazy pieces.
- **Apps** (`offline/{id}.json`): everything the app's roots reach without entering core.
- Both leave out what other runtime rules cache (`*.wasm`, `*.onnx`, `*.ttf|ttc`, `*.aff|dic`, `assets/mammoth-*.js`).
- Each file is `{ "build": <buildTimestamp>, "files": ["assets/…", …] }`, sorted. The build stamp is computed once in `vite.config.ts` (`get_version_info`) and shared with `version_plugin`, so `version.json`, `BUILD_INFO` and the cache name agree.

Measured at 3.58.0 (production build): the precache went from 844 entries (12.4 MB) to 305 (4.2 MB). 80 app lists, 3 to 42 files each (6 KB to 2.2 MB); every file in `dist/assets` is in core, in a list, or under a runtime rule.

## Service worker

Still `generateSW` (`vite.config.ts`):

- `manifestTransforms` keeps an entry when it's outside `assets/` (`index.html`, `registerSW.js`, `sw-notifications.js`, icons, manifest) or in core (`offline.precached(url)`).
- The last `runtimeCaching` rule is `CacheFirst` for `^[^?#]*/webos/assets/` into `webos-assets-{buildTimestamp}`, 200 responses only, no expiration (it could evict a picked app). Earlier rules keep the wasm, model, font, dictionary and mammoth files in their own caches.

## Sync

`sync()` takes the Web Lock `webos.offline.sync`. A second call in the same tab joins the running one; another tab's call waits for the lock, then re-reads the state file and usually finds nothing left.

Under the lock, while online and some picked, installed app isn't saved:

1. One `tasks.run("offline", …)` job (TasksService: progress toast, Cancel, Retry, Activity Monitor › Tasks). Title "Keeping Paint offline" or "Keeping 3 apps offline". The build is `sync.ts` `sync_task`: a sequential group with a task per app, re-planned from the current picks on Retry.
2. Each task fetches `{BASE_URL}offline/{id}.json` (`no-cache`), checks its `build` against this page's (another build's list throws "WebOS was updated since this page loaded…", so a stale tab never saves the wrong files), then fetches the files six at a time (`pool`). A file already in this build's cache is skipped; one in any other cache (the previous build's, the precache) is copied with `caches.match`, so an update only downloads the files it renamed. Progress per task, message "Paint · 12 of 40 files".
3. A finished task adds the app to `saved` and writes the state file. A failed or cancelled job ends the loop.
4. Once nothing is left: every `webos-assets-*` cache except this build's is deleted (`stale_caches`). Only that prefix: every lilbunnyrabbit site on the host shares the origin.

The loop runs again if an app was ticked while a job ran. The lazy `sync.ts` holds the task-manager import and the downloader, so none of it is on the boot path.

**Opened apps.** An effect over `windows.list()` sees every app that gets a window (launch, session restore, deep link). The first time a user app that isn't saved shows up in a session, `save_app` downloads its list quietly, in a queue, without a task or toast, then adds it to `saved`. A failure (offline, a deploy in between) is logged and the app is tried again on its next open.

## Lifecycle

`init()`:

- `online`/`offline` listeners (coming online with picked apps left starts a sync) and `visibilitychange` (visible: re-read both files).
- Reads `/etc/offline.json` and `/var/lib/offline/state.json`. A state file from this build fills `saved`; a missing one or another build's starts empty and writes `{ build, apps: [] }`.
- **Migration.** No state file, a version marker (`/var/lib/version/state.json`) and not solo: an existing install's first boot of this version. Sticky toast "Apps now load when you open them" / "Updates take seconds now. Pick the apps that should also work offline." with **Choose apps** → `apps.launch("settings", { section: "offline" })`. A fresh install has no marker yet and gets nothing; the state file is written either way, so it shows once.
- Effects: the revisions of `/etc` and `/var/lib/offline` re-read the files (skipped while one of this tab's writes is pending), and the open-windows effect above.
- After an update (state from another build) or with picked apps not saved: `sync()` on `on_idle` (`requestIdleCallback`, or a `setTimeout` where Safari has none), so the old build's cache is deleted even with nothing picked.

`destroy()` removes the listeners and disposes the effects.

## Persistence

| Where | What | Format |
|-------|------|--------|
| `/etc/offline.json` | Picked apps. Config, so it's part of backups | `{ "version": 1, "apps": ["cards", "paint"] }`, sorted, through `LatestWriter`. Missing or invalid → nothing picked. System app ids are dropped on read; an id another app [replaces](apps.md#replaced-app-ids-adr-071) reads as every app replacing it (`current_ids`), saved that way on the next write |
| `/var/lib/offline/state.json` | Apps saved in this build | `{ "build": 1792699153883, "apps": [...] }`, through `LatestWriter`. Another build's file counts as empty |
| Cache Storage `webos-assets-{build}` | The files | Written by the service worker (any `/assets/` request) and by this service (`cache.put`) |

Parse and serialize in `persistence.ts` (zod), list helpers in `lists.ts`, both unit-tested (`lists.test.ts`); the service in `service.browser.test.ts`.

## UI

- **Launchers** (start menu, and on mobile the home's Recent and pinned rows and the full app list): while offline, tiles and rows of apps that `can_open` says no to render at `opacity-38` with an sr-only "(not saved for offline)"; tapping one doesn't launch, it toasts "{App} isn't saved for offline" with the note and **Choose apps** (`explain_offline`). `OfflineNote` (`components/apps/offline-note.svelte`) sits above the grid (on mobile, in the app list's header) while offline: "You're offline. Dimmed apps aren't saved on this device yet." with a quiet **Choose apps** button.
- **Keep offline** (`keep_offline_item`): in the start menu's tile menu, the phone's app row menu (`app_menu`) and the taskbar window menu, user apps only; the icon is a check while picked. Toggles `set_picked`.
- **A window whose code fails to load while offline** (`update/load-failed.svelte`, any path: desktop icon, restored session, Terminal): "{App} isn't saved for offline" with the same note, **Choose apps** and **Close window**, instead of the update or error text. When the connection comes back the screen turns into the online "didn't load" state with **Try again** ([window](../shell/window.md#content-and-app-context)).
- **Settings › Offline** ([system apps](../system-apps.md#settings)).

## Divergence from ADR

- ADR-065 says other tabs follow the state file's revision. FilesService revisions are per tab, so another tab's saves are picked up when this tab becomes visible again (and when its own sync takes the lock, which re-reads first). Revision note 2026-10-22.
- The per-app lists carry the build stamp (`{ build, files }`), not just the files, so a tab running an older build never saves the newer build's files under its own cache. Revision note 2026-10-22.

## Shell

None (ADR-065).

## Known gaps

- Retry from Activity Monitor runs outside the Web Lock.
- Another tab's sync can overwrite the state file with its own view; the worst case is an app downloaded again (each file is skipped when cached).
- An opened, unpicked app's `commands`, `widget` and `on_fire` chunks are in its list but load only online until the app has been saved: offline, the Terminal skips that app's commands (`allSettled`) and a scheduler handler of an app never opened since the update can't load.
- Cache Storage can be evicted by the browser; `saved` doesn't notice until the next build.
- No size per app in Settings: that would mean fetching every app's list.
