# StoreService

Key `store` · Depends on: `files`, `apps`, `tasks` · ADR: [ADR-077](../../adrs/077-app-store.md) (stages 1 and 2), [ADR-065](../../adrs/065-apps-on-demand.md), [ADR-071](../../adrs/071-split-color-games.md) · Source: `src/lib/core/api/services/store/`, `tooling/vite-plugin-offline.ts`, `src/lib/core/components/apps/app-progress.svelte` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Keeps installed apps on the device. One state per app (ADR-077): installed means listed, downloaded, kept offline and updated. The service worker precaches only the core, so an update installs in seconds whatever the number of apps ([version › Service worker](version.md#service-worker)). Every app, system apps included, loads on demand into a per-build runtime cache, and this service downloads an installed app's whole file list into it:

- when the app is installed (App Store, search, a menu's Install, the "{App} isn't installed" toast, the intro's interests);
- after every update, for every installed app (unchanged files are copied from the previous build's cache, so only renamed ones download);
- on a fresh install, the system apps (always installed), on the first idle moment after boot.

Uninstalling deletes the app's files from the cache, except the ones another installed app's list also holds (chunks are shared).

An app opened without installing (AppsService's `launch`, ADR-077's Open) loads on demand like any other, isn't downloaded whole and isn't promised offline.

AppsService owns the installed set ([apps](apps.md#init-the-installed-list-adr-040)) and the catalogue it reads ([apps](apps.md#catalogue-adr-077)); this service follows the set, downloads it and writes the installed apps' catalogue boot reads ([below](#the-installed-apps-catalogue)). Update detection and hot swaps are ADR-077 stage 3.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `online` | `boolean` | `$state`, `navigator.onLine`, kept by `online`/`offline` events |
| `syncing` | `boolean` | `$state`, true while this tab runs a download job |
| `is_saved` | `(id) => boolean` | Every file of the app is in this build's cache. A set lookup |
| `status` | `(id) => StoreStatus` | `not-installed` \| `downloading` \| `saved` \| `not-saved` (installed, not all files here yet) |
| `progress` | `(id) => number \| null` | 0 to 1 while the app downloads in this tab, else `null`. Reactive; `AppProgress` reads it |
| `sync` | `() => Promise<void>` | See [Sync](#sync). Never throws; a no-op in dev |

## Build: the file lists

`tooling/vite-plugin-offline.ts` (`offline_plugin(build)`, registered in `vite.config.ts` after the import map) runs in `writeBundle`, so it sees final file names (core renamed after the import map), before vite-plugin-pwa writes `sw.js` in `closeBundle`.

- **Roots.** For each `src/lib/apps/{system,user}/{id}/index.ts`, its manifest chunk (`{id}.manifest-<hash>.js`, the entry the catalogue plugin emits, which AppsService loads first; a facade when the app's component imports its own manifest) and the chunks of every module the manifest `import()`s: the component, `commands`, `highlights`, `preview`, `widget`, `on_fire`, `on_uninstall_data`, `meta` (never loaded at runtime, a few hundred bytes). `core` is never a root.
- **Edges.** A chunk's `imports` and `dynamicImports`, its `importedCss` and `importedAssets`, and the hashed file names its code mentions that are assets (worker scripts, `?url` files). Vite's `__vite__mapDeps` preload table is stripped first: it lists every `import()`'s deps, apps' included. Assets (worker bundles, CSS) are scanned for hashed names too.
- **Core** (`offline/core.json`): everything `index.html` and the entry (`boot.ts`; the manifest entries don't count) reach without entering a root. That is the shell, `main`, `core`, their lazy chunks (the changelog among them) and the fonts the CSS names. A chunk an app shares with core (File Explorer's components, which the file picker uses) stays in core.
- **Apps** (`offline/{id}.json`): everything the app's roots reach without entering core. System apps get a list like user apps (ADR-077).
- Both leave out what other runtime rules cache (`*.wasm`, `*.onnx`, `*.ttf|ttc`, `*.aff|dic`, `assets/mammoth-*.js`).
- Each file is `{ "build": <buildTimestamp>, "files": ["assets/…", …] }`, sorted. The build stamp is computed once in `vite.config.ts` (`get_version_info`) and shared with `version_plugin`, so `version.json`, `BUILD_INFO` and the cache name agree. The catalogue plugin copies each list into its app's `files` ([overview](../overview.md)).

Measured at 3.58.0: the precache went from 844 entries (12.4 MB) to 305 (4.2 MB). At 3.74.0, with system apps out of core: 202 entries (2.7 MB), 105 app lists. A fresh preview boot fetched no file of any system app's list before an app opened.

## Service worker

Still `generateSW` (`vite.config.ts`):

- `manifestTransforms` keeps an entry when it's outside `assets/` (`index.html`, `registerSW.js`, `sw-notifications.js`, icons, manifest) or in core (`offline.precached(url)`).
- The Portfolio path (`/webos/portfolio/`, written by `tooling/vite-plugin-portfolio-path.ts` when the Portfolio app exists) is a copy of `index.html` left out of the precache (`globIgnores`) and of the navigation fallback (`navigateFallbackDenylist`), so it always comes from the network and boots the deployed build. Its one extra script defaults a bare visit to `#/solo/portfolio` and drops the query (the `portfolio` repo's redirect adds `?t=` to skip the HTTP cache, and carries the hash so a worker from before 3.70.1, which still answers the path with its cached shell, opens Portfolio rather than the desktop). Offline it doesn't load.
- `store/` (the catalogue and the icon sprite) is `NetworkFirst` into `webos-store` (4 s network timeout, 200 only, at most 4 entries): fresh online, the last copy offline, so the App Store and search still list apps that aren't installed. Neither file is precached.
- The last `runtimeCaching` rule is `CacheFirst` for `^[^?#]*/webos/assets/` into `webos-assets-{buildTimestamp}`, 200 responses only, `ignoreVary`, no expiration (it could evict an installed app). Earlier rules keep the wasm, model, font, dictionary and mammoth files in their own caches.

## Sync

`sync()` takes the Web Lock `webos.store.sync`. A second call in the same tab joins the running one; another tab's call waits for the lock, then re-reads the state file and usually finds nothing left.

Under the lock, while online and some installed app isn't saved (`pending()`, system apps first):

1. One `tasks.run("store", …)` job (TasksService: progress toast, Cancel, Retry, Activity Monitor › Tasks). The title says why: "Setting up apps" on a fresh install (no state file), "Updating Paint" / "Updating 12 apps" on the first boot of a new build, "Installing Paint" / "Installing 3 apps" otherwise; done says "Apps are ready", "12 apps updated" or "Paint is installed", each with "works offline". The build is `sync.ts` `sync_task`: a sequential group with a task per app, re-planned from the current pending apps on Retry.
2. Each task fetches `{BASE_URL}offline/{id}.json` (`no-cache`), checks its `build` against this page's (another build's list throws "WebOS was updated since this page loaded…", so a stale tab never saves the wrong files), then fetches the files six at a time (`pool`). A file already in this build's cache is skipped; one in any other cache (the previous build's, the precache) is copied with `caches.match`. Progress per task, message "Paint · 12 of 40 files", and `progress(id)` follows each file.
3. A finished task adds the app to `saved` (if it's still installed) and writes the state file. A failed or cancelled job ends the loop.
4. Once nothing is left: every `webos-assets-*` cache except this build's is deleted (`stale_caches`). Only that prefix: every lilbunnyrabbit site on the host shares the origin.

The loop runs again if an app was installed while a job ran. The lazy `sync.ts` holds the task-manager import and the downloader, so none of it is on the boot path.

**Following the installed set.** An effect over `apps.list({ installed: true })` compares it with the last one. A new app that isn't saved starts `sync()`. A removed app leaves `saved` at once, then, under the same lock and only online, `drop_app` fetches its list and every installed app's list and deletes from this build's cache the files only it holds (`unshared` in `lists.ts`). Offline, or when a list fails, nothing is deleted; the files go with this build's cache at the next update.

## The installed apps' catalogue

`/var/lib/apps/catalogue.json` is the only thing boot reads to list apps ([apps](apps.md#catalogue-adr-077)). An effect over `apps.installed_catalogue()` writes it through a `LatestWriter` seeded with the file's text, so it's written only when it changes:

- on the first boot of a release, once AppsService has this build's full catalogue (the slice it read was another build's, or missing);
- on every install and uninstall, with the new app's entry (from the full catalogue the Store or search fetched) or without the removed one.

`installed_catalogue()` is `null` while an installed app's entry is unknown or another build's, so a slice that can't run here is never written. It's written before the app's files finish downloading: the slice says what's installed, the state file what's on the device.

## Lifecycle

`init()`:

- `online`/`offline` listeners (coming online with installed apps left to save starts a sync) and `visibilitychange` (visible: re-read the state file).
- Reads `/var/lib/store/state.json`, and seeds the catalogue writer with `/var/lib/apps/catalogue.json`. Missing: reads the old `/var/lib/offline/state.json` instead, once, and deletes `/var/lib/offline`. A state from this build fills `saved`; a missing one or another build's starts empty and writes `{ build, apps: [] }`.
- **Migration from kept offline (ADR-077).** Not solo, and `/etc/offline.json` exists: picks the device doesn't know need the full catalogue first (offline, the file waits for a later boot); its apps (an id another app [replaces](apps.md#replaced-app-ids-adr-071) read as every app replacing it, `current_ids`) are installed through `apps.install`, then the file is deleted. A solo tab leaves it for the full OS.
- Effects: the revision of `/var/lib/store` re-reads the file (skipped while one of this tab's writes is pending), the installed-set effect above, and the installed apps' catalogue.
- After an update (state from another build) or with installed apps not saved: `sync()` on `on_idle` (`requestIdleCallback`, or a `setTimeout` where Safari has none), never awaited by boot.

`destroy()` removes the listeners and disposes the effects.

## Persistence

| Where | What | Format |
|-------|------|--------|
| `/var/lib/store/state.json` | Apps saved in this build | `{ "build": 1792699153883, "apps": [...] }`, sorted, through `LatestWriter`. Another build's file counts as empty |
| `/var/lib/apps/catalogue.json` | The installed apps' catalogue entries, read by AppsService at boot | `{ "version": 1, "core", "build", "release", "apps": [...] }`, the entries sorted by id, minified |
| Cache Storage `webos-store` | The last `store/catalogue.json` and `store/icons.svg` | Written by the service worker's `NetworkFirst` rule |
| `/var/lib/offline/state.json` | Before 3.74.0. Read once when the new file is missing, then the folder is deleted | Same shape |
| `/etc/offline.json` | Before 3.74.0: apps kept offline. Joined to the installed set once, then deleted | `{ "version": 1, "apps": [...] }` |
| Cache Storage `webos-assets-{build}` | The files | Written by the service worker (any `/assets/` request) and by this service (`cache.put`) |

Parse and serialize in `persistence.ts` (zod), list helpers in `lists.ts`, both unit-tested (`lists.test.ts`); the service in `service.browser.test.ts`.

## UI

- **Progress ring** (`components/apps/app-progress.svelte`, next to `AppBadge`): while `progress(id)` isn't `null`, a `bg-background/60` scrim over the icon tile with a `primary` ring (`stroke-dashoffset` over `pathLength="100"`), `role="progressbar"`. On the start menu's tiles, taskbar items and quick launch, desktop icons, the phone's home rows and app list, and the App Store's tiles, details and showcase. Plus the one progress toast from TasksService.
- **A window whose code fails to load while offline** (`update/load-failed.svelte`, any path): "{App} isn't on this device yet" / "Installed apps download while you're online, then work offline. An app opened without installing needs a connection." with **Close window**. When the connection comes back the screen turns into the online "didn't load" state with **Try again** ([window](../shell/window.md#content-and-app-context)).
- Install and Open themselves are AppsService's ([apps](apps.md#launchid-props)); the buttons are in the App Store ([system apps](../system-apps.md#app-store)), the launchers ([taskbar](../shell/taskbar.md), [mobile](../shell/mobile.md)) and the not-installed toast.

## Divergence from ADR

- ADR-065 says other tabs follow the state file's revision. FilesService revisions are per tab, so another tab's saves are picked up when this tab becomes visible again (and when its own sync takes the lock, which re-reads first). Revision note 2026-10-22.
- The per-app lists carry the build stamp (`{ build, files }`), not just the files, so a tab running an older build never saves the newer build's files under its own cache. Revision note 2026-10-22.
- ADR-077 stage 1: the mobile "switcher menu" Install is a button on the switcher card's header, since phones have no switcher menu. Revision note 2026-10-26.

## Shell

None (ADR-065, ADR-077: no new commands).

## Known gaps

- Retry from Activity Monitor runs outside the Web Lock.
- Another tab's sync can overwrite the state file with its own view; the worst case is an app downloaded again (each file is skipped when cached).
- Uninstall fetches every installed app's list to know which files are shared: a request per installed app, once per uninstall.
- An app opened without installing has its `commands`, `widget` and `on_fire` chunks load only online.
- Cache Storage can be evicted by the browser; `saved` doesn't notice until the next build.
- A fresh install downloads every system app on first idle (Docs alone is 170 files), on phone data too.
