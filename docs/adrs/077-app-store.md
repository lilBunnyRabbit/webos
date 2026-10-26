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
- System apps are apps like any other: installed by default and locked. They leave the precache, which becomes core only.
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
