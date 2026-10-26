# StoreService

Key `store` · Depends on: `files`, `apps`, `tasks` · ADR: [ADR-077](../../adrs/077-app-store.md) (stages 1 to 3), [ADR-065](../../adrs/065-apps-on-demand.md), [ADR-071](../../adrs/071-split-color-games.md) · Source: `src/lib/core/api/services/store/`, `tooling/vite-plugin-offline.ts`, `src/lib/core/components/apps/app-progress.svelte` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Keeps installed apps on the device. One state per app (ADR-077): installed means listed, downloaded, kept offline and updated. The service worker precaches only the core, so an update installs in seconds whatever the number of apps ([version › Service worker](version.md#service-worker)). Every app, system apps included, loads on demand into one runtime cache, `webos-assets`, shared by every release, and this service downloads an installed app's whole file list into it:

- when the app is installed (App Store, search, a menu's Install, the "{App} isn't installed" toast, the intro's interests);
- after every update, for every installed app (a file already in the cache is skipped, so only renamed ones download);
- after an app-only update, without a reload ([Hot updates](#hot-updates-adr-077-stage-3)), for the installed apps whose files changed;
- on a fresh install, the core apps (App Store, Settings, File Explorer, Terminal; the only ones installed by default), on the first idle moment after boot.

Uninstalling deletes the app's files from the cache, except the ones another installed app's list also holds (chunks are shared).

An app opened without installing (AppsService's `launch`, ADR-077's Open) loads on demand like any other, isn't downloaded whole and isn't promised offline.

AppsService owns the installed set ([apps](apps.md#init-the-installed-list-adr-040)) and the catalogue it reads ([apps](apps.md#catalogue-adr-077)); this service follows the set, downloads it, writes the installed apps' catalogue boot reads ([below](#the-installed-apps-catalogue)) and follows app-only updates ([below](#hot-updates-adr-077-stage-3)).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `online` | `boolean` | `$state`, `navigator.onLine`, kept by `online`/`offline` events |
| `syncing` | `boolean` | `$state`, true while this tab runs a download job |
| `is_saved` | `(id) => boolean` | Every file of the app's current entry is in the cache. A set lookup |
| `status` | `(id) => StoreStatus` | `not-installed` \| `downloading` \| `saved` \| `not-saved` (installed, not all files here yet) |
| `progress` | `(id) => number \| null` | 0 to 1 while the app downloads in this tab, else `null`. Reactive; `AppProgress` reads it |
| `sync` | `() => Promise<void>` | See [Sync](#sync). Never throws; a no-op in dev |

## Build: the file lists

`tooling/vite-plugin-offline.ts` (`offline_plugin(build)`, registered in `vite.config.ts` after the import map) runs in `writeBundle`, so it sees final file names (core renamed after the import map), before vite-plugin-pwa writes `sw.js` in `closeBundle`.

- **Roots.** For each `src/lib/apps/{system,user}/{id}/index.ts`, its manifest chunk (`{id}.manifest-<hash>.js`, the entry the catalogue plugin emits, which AppsService loads first; a facade when the app's component imports its own manifest) and the chunks of every module the manifest `import()`s: the component, `commands`, `highlights`, `preview`, `widget`, `on_fire`, `on_uninstall_data`, `meta` (never loaded at runtime, a few hundred bytes). `core` is never a root.
- **Edges.** A chunk's `imports` and `dynamicImports`, its `importedCss` and `importedAssets`, and the hashed file names its code mentions that are assets (worker scripts, `?url` files). Vite's `__vite__mapDeps` preload table is stripped first: it lists every `import()`'s deps, apps' included. Assets (worker bundles, CSS) are scanned for hashed names too.
- **Core** (`offline/core.json`): everything `index.html` and the entry (`boot.ts`; the manifest entries don't count) reach without entering a root. That is the shell, `main`, `core`, their lazy chunks (the changelog among them) and the fonts the CSS names. A chunk an app shares with core (File Explorer's components, which the file picker uses) stays in core.
- **Apps** (`offline/{id}.json`): everything the app's roots reach without entering core or content. System apps get a list like user apps (ADR-077).
- **Content** (ADR-077): a chunk whose every module was imported with the `content` query (`?raw&content`, Docs' pages) is never entered. The list file names the content the app's files import apart, `content`; nothing downloads it, it loads when read and the runtime rule keeps it ([overview](../overview.md#build--deploy)).
- Both leave out what other runtime rules cache (`*.wasm`, `*.onnx`, `*.ttf|ttc`, `*.aff|dic`, `assets/mammoth-*.js`).
- Each file is `{ "build": <buildTimestamp>, "files": ["assets/…", …], "content"?: [...] }`, sorted. The build stamp is computed once in `vite.config.ts` (`get_version_info`) and shared with `version_plugin`, so `version.json`, `BUILD_INFO` and the cache name agree. The catalogue plugin copies each list into its app's `files` ([overview](../overview.md)).

Measured at 3.58.0: the precache went from 844 entries (12.4 MB) to 305 (4.2 MB). At 3.74.0, with system apps out of core: 202 entries (2.7 MB), 105 app lists. A fresh preview boot fetched no file of any system app's list before an app opened.

## Service worker

Still `generateSW` (`vite.config.ts`):

- `manifestTransforms` keeps an entry when it's outside `assets/` (`index.html`, `registerSW.js`, `sw-notifications.js`, icons, manifest) or in core (`offline.precached(url)`).
- The Portfolio path (`/webos/portfolio/`, written by `tooling/vite-plugin-portfolio-path.ts` when the Portfolio app exists) is a copy of `index.html` left out of the precache (`globIgnores`) and of the navigation fallback (`navigateFallbackDenylist`), so it always comes from the network and boots the deployed build. Its one extra script defaults a bare visit to `#/solo/portfolio` and drops the query (the `portfolio` repo's redirect adds `?t=` to skip the HTTP cache, and carries the hash so a worker from before 3.70.1, which still answers the path with its cached shell, opens Portfolio rather than the desktop). Offline it doesn't load.
- `store/` (the catalogue and the icon sprite) is `NetworkFirst` into `webos-store` (4 s network timeout, 200 only, at most 4 entries): fresh online, the last copy offline, so the App Store and search still list apps that aren't installed. Neither file is precached.
- The last `runtimeCaching` rule is `CacheFirst` for `^[^?#]*/webos/assets/` into `webos-assets` (one name for every release, so the cache name alone no longer changes `sw.js`), 200 responses only, `ignoreVary`, no expiration (it could evict an installed app). Before 3.74.0 it was `webos-assets-{buildTimestamp}`, a cache per build; those are deleted on the next prune. Earlier rules keep the wasm, model, font, dictionary and mammoth files in their own caches.

## Sync

`sync()` takes the Web Lock `webos.store.sync`. A second call in the same tab joins the running one; another tab's call waits for the lock, then re-reads the state file and usually finds nothing left.

Under the lock, while online and some installed app isn't saved (`pending()`, system apps first):

1. One `tasks.run("store", …)` job (TasksService: progress toast, Cancel, Retry, Activity Monitor › Tasks). The title says why: "Setting up apps" on a fresh install (no state file), "Updating Paint" / "Updating 12 apps" on the first boot of a new build, "Installing Paint" / "Installing 3 apps" otherwise; done says "Apps are ready", "12 apps updated" or "Paint is installed", each with "works offline". The build is `sync.ts` `sync_task`: a sequential group with a task per app, re-planned from the current pending apps on Retry.
2. Each task takes the app's `files` from its catalogue entry (the slice AppsService holds; no list is fetched), then fetches them six at a time (`pool`). A file already in `webos-assets` is skipped; one in any other cache (an old per-build cache, the precache) is copied with `caches.match`. A 404 means the host already serves a newer deploy: the task fails with "WebOS was updated since this page loaded. Update WebOS to install {App}." Progress per task, message "Paint · 12 of 40 files", and `progress(id)` follows each file.
3. A finished task adds the app to `saved` (if it's still installed) and writes the state file. A failed or cancelled job ends the loop.
4. Once nothing is left, `prune()`: the old per-build `webos-assets-*` caches are deleted (`legacy_caches`; only that prefix, every lilbunnyrabbit site on the host shares the origin), then every file in `webos-assets` that `apps.files_in_use()` doesn't list (`prune_files`): the installed apps' `files` and `content` in the current catalogue, plus the entry of every app whose code runs in this tab (the old one while an update waits for its windows). Skipped when the state file names a newer catalogue than this tab's: another tab took an app-only update, and its new files aren't in this tab's lists.

The loop runs again if an app was installed while a job ran. The lazy `sync.ts` holds the task-manager import and the downloader, so none of it is on the boot path.

**Following the installed set.** An effect over `apps.list({ installed: true })` compares it with the last one. A new app that isn't saved starts `sync()`. A removed app leaves `saved` at once, then, under the same lock, `drop_files` deletes the files only it holds among the installed apps' entries (`unshared` in `lists.ts`; the service keeps the last entry it saw of every app, so an uninstalled app's list is still known). Nothing is fetched.

## Hot updates (ADR-077 stage 3)

An app-only deploy keeps the page. VersionService's poll finds `version.json`'s `core` equal to the running core (`running_core()`, the `<meta name="webos-core">` the build writes into `index.html`) and calls `apps.refresh(build)` ([version](version.md#app-only-updates)); AppsService takes the newer catalogue ([apps](apps.md#app-only-updates-stage-3)) and sets `last_update` (`{ build, changed, swapped }`). This service follows it:

1. `take_update`: the state's `build` becomes the new catalogue's. When the state file already names it (another tab got there first), its saved set is read; otherwise the installed apps whose files changed (`swapped`) leave `saved`.
2. `sync()` with the reason `apps`: "Updating Snake" / "Updating 3 apps", one progress toast, a ring on each updating icon. Done: "Snake and 2 more updated" (user apps named first; Docs, Kernel and Settings change whenever a release's docs name its version), "They work offline too.", with **What's new** (Settings › What's new, which shows the new release's notes from `version.json`).
3. Then it posts `{ type: "apps-ready", core, apps }` on the `BroadcastChannel` `webos:store`. Every other tab on the same core calls `apps.refresh()` at once, instead of at its next poll; its `take_update` finds the saved set in the state file, so it downloads nothing and shows no toast.

An app with open windows keeps running its old code; the window's titlebar shows **Update**, the taskbar item **Update ready**, the phone's switcher card **Update**, and the App Store's Updates place lists it under "Update ready", all running `apps.restart(id)`. Closed apps switch silently. Only the Web Lock holder downloads: two tabs that poll together both take the update, and the second one's sync finds the work done.

**While a core update waits** (the poll found another core, the overlay hasn't run yet), a catalogue fetched for the Store or search is another core's: its new apps are listed but `foreign`, and Install or Open of one toasts "Update WebOS to open {App}" with **Restart** (`version.apply_update()`) instead of failing ([apps](apps.md#launchid-props)). An installed app whose files are gone from the host fails its download with the same advice.

## The installed apps' catalogue

`/var/lib/apps/catalogue.json` is the only thing boot reads to list apps ([apps](apps.md#catalogue-adr-077)). An effect over `apps.installed_catalogue()` writes it through a `LatestWriter` seeded with the file's text, so it's written only when it changes:

- on the first boot of a release, once AppsService has this core's full catalogue (the slice it read was another core's, or missing);
- after an app-only update, with the new entries;
- on every install and uninstall, with the new app's entry (from the full catalogue the Store or search fetched) or without the removed one.

`installed_catalogue()` is `null` while an installed app's entry is unknown or another core's, so a slice that can't run here is never written. It also holds every system app's entry ([apps](apps.md#persistence)). It's written before the app's files finish downloading: the slice says what's installed, the state file what's on the device.

## Lifecycle

`init()`:

- `online`/`offline` listeners (coming online with installed apps left to save starts a sync) and `visibilitychange` (visible: re-read the state file).
- Opens the `webos:store` `BroadcastChannel`. Reads `/var/lib/store/state.json`, and seeds the catalogue writer with `/var/lib/apps/catalogue.json`. Missing: reads the old `/var/lib/offline/state.json` instead, once, and deletes `/var/lib/offline`. A state for the current catalogue's build (`installed_catalogue().build`, which an app-only update moves past the bundle's own) fills `saved`; a missing one or another build's starts empty and writes `{ build, apps: [] }`.
- **Migration from kept offline (ADR-077).** Not solo, and `/etc/offline.json` exists: picks the device doesn't know need the full catalogue first (offline, the file waits for a later boot); its apps (an id another app [replaces](apps.md#replaced-app-ids-adr-071) read as every app replacing it, `current_ids`) are installed through `apps.install`, then the file is deleted. A solo tab leaves it for the full OS.
- Effects: the revision of `/var/lib/store` re-reads the file (skipped while one of this tab's writes is pending), the installed-set effect above, the installed apps' catalogue, and `apps.last_update` ([Hot updates](#hot-updates-adr-077-stage-3)).
- After an update (state from another build) or with installed apps not saved: `sync()` on `on_idle` (`requestIdleCallback`, or a `setTimeout` where Safari has none), never awaited by boot.

`destroy()` closes the channel, removes the listeners and disposes the effects.

## Persistence

| Where | What | Format |
|-------|------|--------|
| `/var/lib/store/state.json` | Apps saved for the current catalogue | `{ "build": 1792699153883, "apps": [...] }`, sorted, through `LatestWriter`. `build` is the catalogue's (the bundle's own, or a newer one an app-only update brought). Another build's file counts as empty |
| `/var/lib/apps/catalogue.json` | The installed apps' catalogue entries, read by AppsService at boot | `{ "version": 1, "core", "build", "release", "apps": [...] }`, the entries sorted by id, minified |
| Cache Storage `webos-store` | The last `store/catalogue.json` and `store/icons.svg` | Written by the service worker's `NetworkFirst` rule |
| `/var/lib/offline/state.json` | Before 3.74.0. Read once when the new file is missing, then the folder is deleted | Same shape |
| `/etc/offline.json` | Before 3.74.0: apps kept offline. Joined to the installed set once, then deleted | `{ "version": 1, "apps": [...] }` |
| Cache Storage `webos-assets` | The files, every release | Written by the service worker (any `/assets/` request) and by this service (`cache.put`); pruned against `apps.files_in_use()` |
| Cache Storage `webos-assets-{build}` | Before 3.74.0: a cache per build | Copied from on the next sync, then deleted |

Parse and serialize in `persistence.ts` (zod), list helpers in `lists.ts`, both unit-tested (`lists.test.ts`); the service in `service.browser.test.ts`.

## UI

- **Progress ring** (`components/apps/app-progress.svelte`, next to `AppBadge`): while `progress(id)` isn't `null`, a `bg-background/60` scrim over the icon tile with a `primary` ring (`stroke-dashoffset` over `pathLength="100"`), `role="progressbar"`. On the start menu's tiles, taskbar items and quick launch, desktop icons, the phone's home rows and app list, and the App Store's tiles, details and showcase. Plus the one progress toast from TasksService.
- **A window whose code fails to load while offline** (`update/load-failed.svelte`, any path): "{App} isn't on this device yet" / "Installed apps download while you're online, then work offline. An app opened without installing needs a connection." with **Close window**. When the connection comes back the screen turns into the online "didn't load" state with **Try again** ([window](../shell/window.md#content-and-app-context)).
- Install and Open themselves are AppsService's ([apps](apps.md#launchid-props)); the buttons are in the App Store ([system apps](../system-apps.md#app-store)), the launchers ([taskbar](../shell/taskbar.md), [mobile](../shell/mobile.md)) and the not-installed toast.

## Divergence from ADR

- ADR-065 says other tabs follow the state file's revision. FilesService revisions are per tab, so another tab's saves are picked up when this tab becomes visible again (and when its own sync takes the lock, which re-reads first). Revision note 2026-10-22.
- The per-app lists carry the build stamp (`{ build, files }`), not just the files, so a tab running an older build never saves the newer build's files under its own cache. Revision note 2026-10-22.
- ADR-077 stage 1: the mobile "switcher menu" Install is a button on the switcher card's header, since phones have no switcher menu. Revision note 2026-10-26.
- ADR-077 says StoreService owns update detection and hot swaps. The poll stays VersionService's and the swap is AppsService's (it owns the registry and the code); this service follows `apps.last_update`, downloads, toasts and tells other tabs. Revision note 2026-10-27.
- `sw.js` still changes on an app-only deploy: the build stamp in `main` and the changelog chunk are precached core files. The open owner decision is in ADR-077's 2026-10-27 revision.

## Shell

None (ADR-065, ADR-077: no new commands).

## Known gaps

- Retry from Activity Monitor runs outside the Web Lock.
- Another tab's sync can overwrite the state file with its own view; the worst case is an app downloaded again (each file is skipped when cached).
- Pruning keeps what this tab runs, not what another tab runs: an old version still open in a second tab can lose a lazy chunk it hasn't loaded yet.
- A widget of an updated app keeps its old code until the page reloads.
- Uninstall fetches every installed app's list to know which files are shared: a request per installed app, once per uninstall.
- An app opened without installing has its `commands`, `widget` and `on_fire` chunks load only online.
- Cache Storage can be evicted by the browser; `saved` doesn't notice until the next build.
