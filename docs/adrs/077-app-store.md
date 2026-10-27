# ADR-077: App Store
**Date:** 2026-10-26
**Status:** Implemented

## Context
Apps have two lists today. "Installed" (ADR-040, `/var/lib/apps/installed.json`) decides what menus show; "kept offline" (ADR-065, `/etc/offline.json`) decides what is downloaded. An installed app can fail offline, and users manage both.

Boot loads every app's manifest (`app-boot`, 14.5 KB gz) and text (`app-meta`, 15.3 KB gz) for 105 apps, so boot grows with every new app (ADR-049, revision 2026-10-24). That breaks ADR-065's scale rule.

Every deploy is one global version. Any change, even to one app, reloads the whole OS. About 7 of the last 25 releases touched only user apps. The registry in the running page has each app's chunk filename baked in, and app chunks import core by minified names that change whenever core changes (`import{eO as Ze,…}from"@webos/core"`), so an app from build N+1 can't run on core N.

Discussion: [2026-10-26 app store](../brainstorm/2026-10-26_app-store.md).

## Decision

### Installed = cached
- One state per app: installed or not. Installed means listed, downloaded, kept offline and updated. The offline "picked" set, `/etc/offline.json`, Settings › Offline, "Keep offline" and the dimmed offline launcher are removed.
- Store buttons on a not-installed app: **Install** and **Open**. Open runs the full app without keeping it (loaded on demand, not in menus, not offline). Opening a file, a deep link or an announcement for a not-installed app opens it the same way and no longer installs silently (ADR-040 change).
- After an update, installed apps download right away: only renamed files, unchanged ones copied. One progress toast, a progress ring on each updating app's icon (start menu, taskbar, desktop, Store). No full-screen wait for apps.
- Uninstall deletes the app's files from the cache, except files another installed app's list also holds.
- System apps are apps like any other and leave the precache, which becomes core only. Only App Store, Settings, File Explorer and Terminal are installed by default and locked; the other system apps install and uninstall like any app (owner, 2026-10-26, round 5).
- Heavy content (Docs' markdown pages and similar content globs) is left out of an app's install list: fetched when opened, then cached. Pages read before work offline; the rest need a connection.
- Migration: picked apps join the installed set once; `/etc/offline.json` is deleted.

### StoreService (`store`)
OfflineService becomes StoreService. It owns the catalogue, downloads, versions, update detection, hot swaps, cache pruning and the Web Lock. AppsService keeps the registry, launch, listings and the installed set.

### Catalogue, flat boot
- Authors keep writing `define_app` in `index.ts`. The build imports every manifest, renders each icon into one SVG sprite (`store/icons.svg`, a `<symbol>` per app) and writes `store/catalogue.json`: per app its id, name, category, associations, text, version, manifest entry and file list, plus the core hash.
- `/var/lib/apps/catalogue.json` holds the core hash and the installed apps' entries, written when a sync or hot update is accepted. Boot reads only that, so boot cost follows installed apps, never all apps.
- Installed apps' `index.ts` code loads in the background after first paint; each tile shows a loading state until its code lands (badges then fill in).
- The full catalogue is fetched network-first when the Store, search's Not installed group, Open with, a deep link, the intro or Game Hub needs it. Not-installed apps show their sprite icon; installed apps keep their component.
- A restored backup whose catalogue doesn't match the build re-fetches.
- `app-boot` and `app-meta` go away.

### Versions and the update screen
- An app's version is the WebOS release its files last changed in (Snake 3.67.0). The build compares each app's file hash with the previous catalogue and keeps the old number when equal. The hash stays internal.
- `version.json` gains the core hash and the new release's changelog entries. The update overlay, now core only, shows from → to, those lines and file progress.

### App updates without reload
- The poll compares the new core hash with the running one. Different: a full update as today. Same: only apps changed, no reload.
- Apps load by URL from the catalogue entry, not from a filename baked into the boot bundle.
- **An app never runs on a core it wasn't built with.** Each catalogue is built against one core hash, and an app update is offered only when that hash equals the running core's. There's no "update the app, keep the old core": a new core means the full update first, then the apps.
- **While a core update waits** (the user hasn't reloaded), the tab keeps the apps it has. GitHub Pages serves only the latest deploy, so the old build's files for an app that isn't cached are gone: Install or Open of such an app says "Update WebOS to open {App}" with Restart instead of failing. Pruning never deletes files the running tab's catalogue still lists.
- Loosening this (stable core export names plus a versioned core API, so apps run on a range of cores) is rejected for now: a bigger core and a compatibility promise on every core change.
- One version per app per tab. Open windows keep the old module; the window's titlebar shows an "Update" button (owner, 2026-10-26: "window of the app should probably have a 'new version' button") and the taskbar item "Update ready", both running Restart app; new windows open the old version until every window of that app is closed, then the next open loads the new one.
- After an app-only update: "Snake and 2 more updated" with What's new.
- One asset cache pruned against the installed apps' lists replaces the cache per build.
- Two tabs: the Web Lock holder downloads; each tab swaps its own apps when their windows close.

### Name
App Library is renamed App Store; the id stays `app-library`. Game Hub stays the games store.

### Stages
1. Installed = cached, StoreService rename, Install / Open, App Store name.
2. Catalogue, flat boot, icon sprite, versions, overlay notes.
3. App updates without reload.

Each stage is its own release and updates its docs in the same commit.

## Alternatives Considered
- **Split `app.json` + `index.ts` per app:** all 105 apps churn, two files forever.
- **Keep every manifest at boot, catalogue only for versions:** no boot win; manifest changes still force a reload.
- **Await installed manifests before first paint:** boot waits on app code.
- **SVG strings in the catalogue** (`{@html}`) or **a lazy icon chunk per app** (~100 requests on first Store open).
- **Whole catalogue in Cache Storage:** boot parses every app.
- **New windows on the new version while old ones run:** two versions of one app writing the same files.
- **Auto restart of clean windows:** surprising mid-game.
- **Download on first open only, or Wi-Fi only on phones:** installed apps may fail offline; Chrome-only signal.
- **Get (shown) + Install (downloaded):** today's two lists renamed. **Try** as the name for Open: reads like a trial version.
- **Fold downloads into AppsService:** the biggest service grows by caching and update logic.
- **System apps stay in core:** every system-app edit is a full reload.
- **Manual semver or hash as the app version.**
- **Notes in the catalogue:** the poll would fetch the big file.

## Consequences
- Updates that touch only apps stop reloading the OS; a core change still does.
- Boot no longer grows with the number of apps that exist.
- A tab can run apps from different releases. A chunk two apps share can load twice.
- A core bug fix still waits for a full update.
- Installed apps cost storage, and phone data after each update.
- Dev server and tests need a catalogue built from the glob, a second path beside the build's.
- Manifests must run in the build's Node step: no DOM or `window` at manifest level.
- Revision notes: ADR-004, ADR-036, ADR-040, ADR-049, ADR-065.
- Docs per stage:
  - stage 1: `system/services/offline.md` becomes `store.md`, `apps.md`, `persistence.md`, `system-apps.md` (App Store), `shell/taskbar.md`, `shell/mobile.md`, `services/settings.md`, kernel table in `CLAUDE.md` and `system/overview.md`, the README services diagram, the Docs app's pages;
  - stage 2: `apps/manifest.md`, `app-api.md`, `kernel.md` (boot), `overview.md` (Chunks, boot budget), `services/version.md` (overlay), `docs/writing-an-app` guidance;
  - stage 3: `store.md` (hot updates), `services/version.md`, `shell/window.md` and `shell/taskbar.md` (Update ready).

## Revisions

### 2026-10-26: stage 1 built
Installed = cached, StoreService, Install / Open and the App Store name shipped in 3.74.0 ([store](../system/services/store.md)). Decided within scope:
- **OfflineService became StoreService** (`services/store`, key `store`), depending on `files`, `apps` and `tasks` only: with the quiet save on first open gone, it no longer watches windows. It follows `apps.list({ installed: true })` with an effect; AppsService's API didn't change.
- **State moved to `/var/lib/store/state.json`**; the old `/var/lib/offline/state.json` is read once when the new file is missing, then the folder is deleted. `/etc/offline.json`'s apps are installed through `apps.install` and the file deleted, not in a solo tab (solo installs nothing). The ADR-065 migration toast ("Apps now load when you open them") is gone with Settings › Offline.
- **System apps get offline lists** (`tooling/vite-plugin-offline.ts` takes `apps/system/*` as roots): the precache went from 305 entries (4.2 MB) to 202 (2.7 MB). On a fresh install they download on the first idle moment, system apps first, as "Setting up apps"; a boot fetched none of their files before an app opened. A chunk a system app shares with core (File Explorer's components, which the file picker uses) stays in core.
- **Job titles** say why: "Setting up apps" (no state file), "Updating N apps" (new build), "Installing {App}".
- **Uninstall** deletes the files only the app's list holds: `drop_app` fetches that list and every other installed app's list, under the sync lock and only online; otherwise the files go with the build's cache at the next update.
- **Open of a not-installed app** toasts "{App} isn't installed" with Install from AppsService's `launch` (a protected `offer_install`, a no-op in solo). The not-installed tile's Install in search is its own button under the tile (start menu) or beside the row (phone), since the tile itself opens.
- **Install on a running window:** the taskbar item's menu on desktop. Phones have no switcher menu, so the switcher card's header gets an Install button.
- **Progress ring:** `components/apps/app-progress.svelte` next to `AppBadge`, a scrim and a `primary` ring over the icon tile, reading `store.progress(id)`.
- **The App Store's grid badge** says Install (was Get); its details and Showcase cards have Install and Open.

### 2026-10-26: stage 2 build side built
The build writes `store/catalogue.json`, `store/icons.svg`, a chunk per manifest, and `core` and `notes` in `version.json` (`tooling/vite-plugin-catalogue.ts`, [overview](../system/overview.md#build--deploy)). The runtime doesn't read them yet; boot is unchanged. Decided within scope:
- **Manifests load through a second, bare Vite server** (`ssrLoadModule`, `svelte()` plus the build's aliases), not the project config, whose plugins would run their hooks twice. Only `apps/{system,user}/*`. The dev server answers `store/*` from the same code with its own loader; Node tests call `collect_apps()` with `import()`.
- **Node-safe manifests needed one core fix:** the `$lib/core/api` barrel builds the kernel on import, and `detect_platform()` / `detect_mode()` read `location`, `matchMedia` and `navigator` in default parameters. They now answer desktop and full without a browser. No manifest needed a change.
- **Catalogue fields** beyond the ADR's list, for the readers it names: `tools` and `replaces` (Open with, old ids in links), `restore`, `defaults`, `daily_rank`, `widget_size`, `default_widget`, and flags for parts that need the manifest's code (`daily`, `widget`, `highlights`, `preview`, `shell`, `badge`). `manifest`, `entry` and `files` are paths relative to the base, like the offline lists.
- **Manifest chunks are facades for now:** an implicit entry per `index.ts`, loaded after `main.ts`. While `main` holds the manifests, each chunk re-exports from it and `main` grows by their export table (+0.4 KB gz, boot 218.6 / 219). They become standalone when boot stops importing them, with no build change. The manifest chunk isn't in `files` yet.
- **Hashes ignore the build stamp and renamed imports**, so a rebuild of the same tree gives the same core and app hashes (checked: two builds, identical hashes for core and all 104 apps). The app hash covers its files, its catalogue data, its symbol and its `index.ts` source (the facade says nothing about the manifest). The core hash covers `offline/core.json`'s files and the precached `public/` files; it changes every release today, because `main`, `app-boot`, `app-meta` and the changelog are in that list until the runtime switch takes them out.
- **`notes`** carry each release's `title` too, for the overlay.
- **System apps have `files: []`** until the offline lists give system apps their own (parallel change); their hash then follows.

### 2026-10-26: stage 2 runtime built
Boot reads only `/var/lib/apps/catalogue.json`; installed apps' code loads after first paint; the full catalogue, the sprite icons, versions and the update screen's notes shipped in 3.74.0 ([apps](../system/services/apps.md#catalogue-adr-077), [store](../system/services/store.md#the-installed-apps-catalogue)). Boot 218.7 → 164.2 KB gz, budget lowered to 167.2. Decided within scope:
- **AppsService holds the catalogue; StoreService writes the slice.** Boot needs every installed entry before `desktop` and `session` init, and store depends on apps, so AppsService reads the slice and fetches the full catalogue (`catalogue()`); StoreService writes `/var/lib/apps/catalogue.json` from `apps.installed_catalogue()`. The ADR gave StoreService the catalogue.
- **The slice is compared by `build`, not by core hash.** Every stage 2 release still reloads, and an app-only release renames that app's files, so a slice from another build can't be trusted. `store/catalogue.json` gained `build` (the build stamp). Stage 3 moves the check to the core hash.
- **AppsService API** (no `define_app` change): `catalogue()`, `load(id)`, `installed_catalogue()`; `meta_ready` is gone; `create_instance` needs the code loaded. `get(id)` returns a stub built from the entry until the manifest loads: data fields from the entry, each lazy part a loader that loads the manifest first, no `props` or `badge`, and an icon component that shows the app's own icon once its code is here, the sprite's symbol while it isn't installed, a pulsing tile meanwhile. `AppListing` gains `daily` (Game Hub lists dailies without loading games).
- **Launch before the code lands** opens the window at once and checks props when the manifest arrives, setting them on the window before the component renders. Router, session restore and widgets load the code first.
- **Another build's catalogue** (a deploy since the page loaded, or an older copy offline) is listed but its code never runs: `load()` rejects with "Update WebOS to open {App}". Offline on a release's first boot, the old slice lists the apps the same way until the catalogue arrives.
- **Order on a release's first boot:** the update was online, so boot fetches `store/catalogue.json` (awaited), StoreService writes this build's slice at once (before the app downloads finish), and later boots work offline from it. A device migrating from 3.73 builds the slice from `installed.json` and the fetched catalogue the same way. With no slice and no network, nothing is listed.
- **Last copy offline:** a `NetworkFirst` service worker rule caches `store/` in `webos-store`; not precached, so app-only releases don't touch the service worker for it.
- **Dev server and tests** use `glob_source()`: the glob described with `manifest_data()`, the build's own function (moved to `services/apps/catalogue.ts` with the entry types, which the plugin imports), so boot never waits for the dev middleware.
- **Deterministic core:** the manifest chunks became entries of their own. As implicit entries Rollup ordered them as they resolved, which reshuffled `core`'s mangled export names from one build of the same tree to the next (core hash unstable even without changes). Measured after the fix: one user-app edit, a version bump and a changelog release give the same core hash; the update downloaded 6 precache files.
- **Changelog out of the core hash:** its chunk is excluded (the build fails if it ever holds another module). The version stamp stays in `main`, already a placeholder in hashing; reading the version from `version.json` instead wasn't needed for the hash.
- **Manifest chunk in `files`:** each app's list starts at its manifest entry (or its facade).
- **Catalogue flags** gained `on_fire` and `on_uninstall_data`, so a stub can run them.
- **Versions:** `AppManifest.version` is the catalogue's; the App Store details say "Version 3.67.0". What `define_app` is given is ignored but still required.
- **Update screen:** from → to, the notes of every release in `version.json` newer than the running one (a dot per change by kind, at most five lines, "and N more"), file progress as before.
- Not done here: the `define_app` version field and the import rule for manifests (the barrel cycle it guarded is gone) stay as they are; both are the owner's to lift.

### 2026-10-27: core apps and content built
Round 5 shipped in 3.74.0 ([apps](../system/services/apps.md#init-the-installed-list-adr-040), [overview](../system/overview.md#build--deploy)). Decided within scope:
- **One constant:** `CORE_APPS` and `is_core_app()` in `services/apps/helpers.ts` (barrel-exported). `is_installed`, `uninstall`'s guard and every Uninstall menu read it instead of `manifest.system`; `system` now only means "listed under System".
- **The slice names every system app**, installed or not. A file's default app (Text Editor, the viewers), Kernel's Docs link, the `docs` and `tour` commands and the taskbar's task indicator open them on demand from what boot knows, offline included, with the usual Install toast. Search's Not installed group lists them.
- **System apps' shell commands stay available when the app isn't installed** (they open it on demand); user apps' still don't.
- **Migration:** `installed.json` gains `"system": true`. A list without it keeps the optional system apps ADR-040's tidy signals point to, once, with the full catalogue; offline they count as installed for that boot, unsaved. No toast.
- **Content convention:** the `content` query parameter (`?raw&content`). The offline plugin leaves content chunks out of every install list and writes them apart (`content` in `offline/{id}.json` and in the catalogue entry); the app hash covers them. Docs' pages are content; Kernel shares them. Measured: Docs 172 files / 851 KB gz → 20 / 59 KB, Kernel 158 / 803 KB → 6 / 11 KB, Style Guide unchanged (29 / 102 KB, no content). Docs shows "This page needs a connection" for a page not cached offline, and its search index keeps unread pages as placeholders.

### 2026-10-27: stage 3 built
App updates without a reload shipped in 3.74.0 ([store](../system/services/store.md#hot-updates-adr-077-stage-3), [apps](../system/services/apps.md#app-only-updates-stage-3), [version](../system/services/version.md#app-only-updates)). Decided within scope:
- **The running core:** the build writes the core hash into `index.html` as `<meta name="webos-core">` after hashing (`with_core_meta`); `running_core()` reads it. `index.html` already changes exactly when core does. The slice and fetched catalogues are compared by `core`, not `build`; a newer build on the same core is an app-only update.
- **Who does what:** VersionService's poll compares cores and calls `apps.refresh(build)`. AppsService swaps (`adopt`): it owns the registry and the loaded code, so one version per app per tab lives there (`stale`, `update_ready`, `restart`, `files_in_use`, `last_update`). StoreService follows `last_update`: downloads, the "Snake and 2 more updated" toast with What's new, and the BroadcastChannel. The ADR gave StoreService the detection and the swaps.
- **Restart app** reuses the session's window snapshot (`session/snapshot.svelte.ts`, `snapshot_window`), closes through the guarded close (dirty windows first) and restores with `windows.restore`. Titlebar Update, taskbar "Update ready" (menu item and corner icon), the phone's switcher card Update, and the App Store's Updates place ("Update ready") all run it.
- **One cache** `webos-assets` for every release. StoreService takes file lists from the catalogue entries (no `offline/{id}.json` fetch); a prune deletes what `apps.files_in_use()` doesn't list (installed apps' files and content, and the old entries of apps running here), and the old `webos-assets-{build}` caches. It skips when another tab took a newer catalogue.
- **Two tabs:** the Web Lock holder downloads, then posts `{ type: "apps-ready", core, apps }` on `BroadcastChannel("webos:store")`; other tabs on the same core take the catalogue at once (the service worker findings' item 2, [findings](../brainstorm/2026-10-26_service-worker-features.md), in scope here as the lightest way). A tab that takes it later reads the saved set from the state file instead of downloading.
- **Pending core update:** a catalogue of another core lists its new apps as `foreign`; Open or Install of one toasts "Update WebOS to open {App}" with Restart (`version.apply_update()`), and a 404 while downloading says the same.
- **Release notes of an app-only update** come from `version.json` (`notes` now carry each line's `apps`) and join `changelog` for the session (`with_notes`), since the running core's changelog chunk predates them.
- Measured with a real preview (build N, Snake changed plus a patch release, build N+1 served in place): core hash equal, poll to Update ready 19 ms with no reload, a second tab's Update ready 24 ms later through the channel, a new Snake window still on the old version, Restart app on the new one; Docs, Kernel and Settings (their docs name the version) swapped silently.

**Decided below (2026-10-27, option 1): `sw.js` still changed on an app-only deploy.** N → N+1 above renamed 6 precached files: `main` (the build stamp, `__VERSION_INFO__`), the boot entry (it names `main`), `index.html`, the changelog chunk, and the two solo chunks. So the browser's own update check installs a new precache in the background and drops the old one's files a long-lived tab may still lazy-load (the changelog chunk). Options: (1) take the running release out of the bundle: VersionService reads version, build and commit from the catalogue slice and `version.json`, and the changelog loads as data from a stable URL (`store/changelog.json`, network-first) instead of a chunk; `sw.js` then changes only with core. (2) Accept it: a few small core files re-download after an app-only deploy, the version Settings shows catches up on the next reload. (3) Move core out of the Workbox precache into StoreService's cache: heaviest, and the owner preferred not to. Recommended: (1), against it: VersionService's `info` stops being a compile-time constant and boot needs the slice before it can say which release it runs.

### 2026-10-27: release out of the bundle
Owner: "Release out of the bundle" (option 1 above). Built the same day ([version](../system/services/version.md#app-only-updates), [overview](../system/overview.md#build--deploy)). Decided within scope:
- **Where the release comes from:** AppsService's held catalogue header, now public as `apps.header` (`CatalogueHeader`: `core`, `build`, `release`, `commit`, `branch`). VersionService's `info` is `$derived` from it, so it moves when `adopt()` takes an app-only update, and `version.json` reaches it through `apps.refresh()`. The catalogue (and so the slice) gained `commit` and `branch`; `buildTime` is the `build` stamp as ISO. A slice from before has neither, so About says "unknown" for them until the next catalogue.
- **`info` can be `null`:** offline on a release's first boot with only the old core's slice, nothing knows the release. About shows "Known once online", the start menu footer and the version badges hide, the seen marker stays, and the first online check fills it. Every reader handles `null`.
- **Changelog as data:** the catalogue plugin writes `store/changelog.json` (the whole `CHANGELOG`, 106 KB raw) and the dev server answers it; `load_changelog()` fetches it (`cache: "no-cache"`, the existing `NetworkFirst` `store/` rule keeps the last copy). A failure leaves the notes from `version.json` and the next call retries. `changelog` is `$derived` and cut at the running release, since the deployed file runs ahead of a tab while a core update waits. Authors keep writing `changelog.ts`; the Discord script still imports it.
- **Guard:** `RELEASE_MODULES` (`changelog.ts`, `build-info.ts`) may be in no chunk; the build fails otherwise. `build-info.ts` stays for the dev server and tests: `glob_source` moved to `apps/glob-source.ts`, imported only under `import.meta.env.DEV`. With neither module volatile, `core_modules` keeps AppsService, VersionService and BackupService in `core`: `main` went from 14.7 to 1.0 KB gz, boot 166.5 → 165.6 KB gz.
- **BackupService** writes the release into `backup.json` from the slice file (`/var/lib/apps/catalogue.json`), which it can read with `files`, rather than taking a new dependency on `apps` or `version`. StoreService's starting `build` is `0` instead of the stamp.
- **Measured** with a build N and N+1 (a Snake edit, 3.74.0 → 3.74.1, a changelog line), `WEBOS_PREVIOUS_CATALOGUE` empty: `sw.js` byte-identical, precache manifest identical (202 entries), core hash identical, 0 core files renamed; new files only `snake.app-*.js` and `snake.manifest-*.js`, changed only `version.json`, `store/catalogue.json`, `store/changelog.json` and `offline/*.json`. A core edit on top (start menu text) changed `sw.js`, the precache (1 file) and the core hash.
- The overlay's "from" version is now the last accepted release. The seen marker isn't moved by a hot update, so the next boot still says "Updated to v…" for an app-only release, as before.

### 2026-10-27: review cleanups
- **Uninstall fetches nothing.** Stage 1's `drop_app` fetched the app's list and every other installed app's. Since stage 3 StoreService keeps the last catalogue entry it saw of every app, so `drop()` reads the files from those entries and deletes the ones only the removed app holds; no request, online or not.
- **No dev `store/catalogue.json`.** The dev server and tests read the glob through `glob_source()`, so the plugin's dev catalogue route and `dev_catalogue` are gone; the dev server still answers `store/icons.svg` and `store/changelog.json`.
- **A missing previous catalogue is loud.** The build still goes on when it can't read the deployed catalogue, but prints a warning that every app gets this release as its version; `WEBOS_REQUIRE_PREVIOUS_CATALOGUE=1` makes it fail. The deploy workflow doesn't set it yet, since the first deploy with a catalogue has nothing to read.

### 2026-10-27: review fixes
Review findings fixed inside 3.74.0 ([store](../system/services/store.md), [apps](../system/services/apps.md), [session](../system/services/session.md)). Decided within scope:
- **Restart app** loads the new version's manifest and component before any window closes; a failure toasts "Couldn't update {App}" and keeps every window on the version it has. Dirty windows ask first, the clean ones close only after; a kept one reopens the ones already closed, on the old version. It never rejects. The titlebar Update, the taskbar's Update ready, the switcher card's Update and the App Store's Update ready list show only while the new files are saved or the device is online (`can_update`).
- **Restarted windows stay out of Reopen closed window:** `apps.restarting(window_id)`, which SessionService's closed tracking skips. A new member on the AppsService interface, the smallest way for Session (which depends on apps) to tell a restart from a close.
- **Another core's apps while a core update waits:** `launch()` toasts "Update WebOS to open {App}" and returns `null` (no window, not remembered), so `launch` now returns `WindowId | null`, like `open()`. `installed_catalogue()` leaves another core's system, recent and pinned entries out instead of returning `null`, so a pin or a recent app can't stall the slice.
- **Offline first boot of a release:** with no catalogue for this core, StoreService holds the state file aside and counts nothing as saved; when the catalogue arrives, its build decides (another build's state clears and syncs).
- **Saved without files:** on idle, each saved app's manifest chunk is looked up in `webos-assets` (one `cache.match` per app); a missing one leaves `saved` (a restored backup, an evicted cache). Backup areas didn't change.
- **Cross-tab pruning:** each tab holds a shared Web Lock `webos.store.build.{build}` for its catalogue (and the old one while a window runs an app's old version); a prune is skipped while another tab holds an older build's. Uninstall's file drop keeps `apps.files_in_use()` too.
- **Unknown installed ids** drop once the full catalogue is here (`current_ids`, so ADR-071's `replaces` still map) and the list is saved; `adopt()` forgets apps the new catalogue no longer names unless they have windows here.
- **Offline migration:** optional system apps an offline boot keeps are `provisional`, never saved, and `installed.json` gets `"system": true` only after the move ran.
- **Slice writes** are skipped when the file names the same core with a newer build (a stale tab).
- **Active time:** a stretch counts at most two minutes (sleep), each save re-reads `usage.json` and adds this tab's time onto it (two tabs), and the minute timer runs only during a stretch.
- **Recent:** the saved list drops only the core apps, like recording does; the phone's home Recent shows apps opened without installing.
- The App Store's size measuring follows the installed apps' file lists, not the slice; one ring component (`progress-ring.svelte`) draws the icon ring and the Store button's.

### 2026-10-27: end-to-end fixes
Found driving production builds (N, an app-only N+1, a core N+2) in Chromium, fixed inside 3.74.0 ([apps](../system/services/apps.md#catalogue-sources), [window](../system/shell/window.md)). Decided within scope:
- **A failed manifest is asked for afresh.** The browser keeps a failed module fetch in its module map, so an app opened offline without installing never loaded in that tab again, and a Restart app that failed offline failed again online. `CatalogueSource.manifest(entry, attempt)` adds `?retry={attempt}` once the app's manifest has failed; AppsService counts failures per app (`failures`).
- **The window's Try again asks AppsService first.** It used to import the URL the error named and render its default export, which for a window opened before its code landed is the manifest, so the window crashed ("u is not a function") when the connection came back. It now runs `apps.get(id).component()` and falls back to the URL retry for a component chunk.
- **Docs pages read after reconnecting** load from the failed chunk's URL with `?retry=n` (`retry_page_url`); before, an unread page opened offline showed "This page didn't load" once online. The helper reads the URL itself: importing `load-error` from an app moved it out of `core` and over the boot budget.
- **The App Store's offline strip** shows only offline. Online with another core's catalogue (a core update waits) it said "Offline" while listing the new apps.

### 2026-10-27: owner calls before the push
- **Boot budget** stays at 167.2 KB gz with 9 bytes left.
- **Docs search** keeps loading every page when Docs opens.
- **The App Store keeps its catalogue for the session**; a long-lived tab's staleness goes on the roadmap with the other cross-tab issues, to be fixed together.
- **Listing every app:** a `listings({ all })` call replaces "call `catalogue()` first" (follow-up).
- **Shelf arrows** stay hand-built; no `::scroll-button()`.
- **ADR-065** is superseded by this ADR.
- **`define_app`'s `version`** is deprecated and **the manifest import rule** is lifted (follow-ups).
