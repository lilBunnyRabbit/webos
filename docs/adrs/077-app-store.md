# ADR-077: App Store
**Date:** 2026-10-26
**Status:** Accepted

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
