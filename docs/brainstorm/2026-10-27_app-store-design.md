# App Store design: a store, not a list
**Date:** 2026-10-27
**Participants:** owner, Claude

## Context
Owner: "redesign the store more to look like a store. reference idk app store (macos), google play and windows store. installed/not installed should not be just in one place. higlighted apps, etc etc." A design call, decided here, not asked.

What exists (3.74.0, [ADR-077](../adrs/077-app-store.md)): the App Store (`app-library`) has two views. **Store** is a file-manager-like browser (category nav, filter chips, sort, grid or list, a details pane). **Showcase** is a page of story cards per category ([brainstorm](2026-10-18_app-showcase.md)). Installed vs not shows only as an "Install" badge on a grid tile; nothing lists what's installed, what it costs on the device or what changed.

Earlier sessions: [app store](2026-10-26_app-store.md) (installed = cached, catalogue, per-app versions), [app showcase](2026-10-18_app-showcase.md).

## What the real stores do
- **macOS App Store:** a sidebar of places (Discover, Arcade, Create, Work, Play, Develop, Categories, Updates) and the account. Discover is editorial: big story cards, then shelves. Every tile carries its button (Get / Open / progress ring / Update). App pages: icon, name, subtitle, the button, an info strip (ratings, age, category, developer, size, languages), screenshots, description, What's New with version and date, Information, More by this developer.
- **Google Play:** tabs (For you, Top charts, Categories, Editors' choice), horizontal shelves with "See all", an Install button that turns into a progress ring then Open. "Manage apps & device" has Updates available with Update all, and Manage (installed, sorted by size, recently used, name) with Uninstall.
- **Microsoft Store:** a left rail (Home, Apps, Gaming, Library). Home has a hero carousel and shelves; Library lists installed apps with Get updates. App pages have a hero, ratings, screenshots, What's new, system requirements and size.

Shared pattern: **places** (discover, browse, library, updates), a **button on every tile** that tells the app's state, **shelves** with See all, an **app page** with a metadata strip, and **Library / Updates as their own places**.

## What fits WebOS
No backend: no ratings, reviews, download counts or top charts. What replaces them, all from data WebOS already has:
- **Top charts / trending** → **New apps** (changelog `introduces`, newest first) and **Recently updated** (apps the newest release notes mention).
- **Editors' choice** → a short hand-picked **Featured** list, data only (`services/apps/featured.ts`, ids plus a tagline), next to `suggestions.ts`.
- **For you / collections** → the intro's interest groups (`INTERESTS`: Create, Get things done, Play, Build) as shelves, plus **Widgets for your desktop** and **Made by the community** (apps with an author other than the owner).
- **Ratings** → nothing. **Size** → what the installed app takes in this device's cache, summed from its file list (unknown for apps that aren't installed: the catalogue has no byte sizes). **Recently used / play time** → the OS's own active time per app (below).
- **Games:** mixed in like any app (owner, 2026-10-27). Game Hub stays as it is: no Games tab, no merge. Steam's library informs the feel of Library and the app page only ("Played 3 h").

## Decided design
One window, four places in a sidebar, categories under them:

| Place | What |
|-------|------|
| **Discover** (default) | A hero carousel (scroll snap) of featured apps: the newest introduced apps first ("New in 3.72"), then the hand-picked list. Then shelves: New apps, Recently updated, the interest collections, Widgets, Made by the community; each a horizontal row of cards with See all. Then the categories as tiles |
| **All apps** and a **category** | The old Store browser: filter chips, sort, grid or list, now with the state button on every tile and row instead of a details pane |
| **Library** | Installed apps: size on the device, time used, last used, version, Open, Uninstall (system apps say "Part of WebOS"). Sort by recent use (default), name or size. Header: count, total size, the browser's storage estimate |
| **Updates** | A thin read of StoreService: installed apps whose files for this release aren't here yet, with **Update all** (`store.sync()`); then **Recently updated** installed apps with the release's line about them. Its nav item counts the waiting ones |

- **Search** in the toolbar searches every place; while there's a query the page is the results (rows with buttons), plus Related and AI suggests as before. Enter opens the first result's page.
- **The state button** (`store-button.svelte`) is on every tile, row, card and page: **Install** (not installed), a progress ring with the percentage (downloading), **Update** (installed, files not here yet, online), **Open**. A solo tab shows Open in WebOS. Installed state is visible everywhere an app is.
- **App page** replaces the place (back arrow, the phone's Back): icon, name, category, byline, the button plus Open (when Install shows), Uninstall, pins (desktop, taskbar, widget), Copy solo link. An info strip: Version, Updated (the release date of its version), Size (installed only), Time used / played, Category, Opens N types. Then the pitch (problem, what it does), the preview image when the manifest has one, highlights, **Goals** (from active time, below), What's new (its changelog lines), Information (file types, commands, widget size, `app launch`), More in {category}.
- **Nav:** the kit `SideNav`: a sidebar from `@2xl`, a scrolling tab row below (the phone). Categories group under an overline in the sidebar.
- **Old links keep working:** `view` gains `discover`, `apps`, `library`, `updates`; `showcase` maps to Discover and `store` to All apps. `app` opens that app's page. `#/solo/app-library?view=showcase` opens Discover.
- **Page transitions:** no View Transitions. `document.startViewTransition` snapshots the whole document: it would fight the windows' own minimize and snap morphs, two App Store windows would need unique names, and a popped-out window lives in another document. A plain scroll-to-top on page change.
- **Not in the kit:** the state button, shelf and cards are App Store only (Game Hub has its own tiles); they move to the kit when a second app needs them.

### Active time and goals (owner, 2026-10-27)
- **The OS counts active time per app, every app:** seconds while one of its windows is focused and the page is visible, the last time, and on how many local days. `/var/lib/apps/usage.json`, `{ version: 1, apps: { [id]: { seconds, last, days } } }`, backed up with `/var/lib`, never sent. AppsService owns it (it owns `/var/lib/apps`); the logic is `services/apps/active-time.ts` (pure, Node-tested) and `active-time.svelte.ts` (the tracker), read with `apps.usage(id)`. Writes go through a `LatestWriter` with a 2 s delay; a running stretch is committed every minute and when the page hides.
- Shown as "Used 3 h" ("Played 3 h" for games) on the app page and in Library; Library sorts by recent use.
- **Goals are derived only, no app API:** opened once, an hour, 5 days, 10 hours, 30 days, a small checklist on the app page. Game Hub's data isn't read.
- **An achievements API is not built**; the main session puts it on the roadmap.

## Key takeaways
- A store is places plus a state button on every app.
- What a backend would rank, the changelog and the OS's own active time stand in for.
- Library and Updates are their own places; installed state shows everywhere.

## Action items
- [x] Discover, All apps and categories, Library, Updates, search results, app page
- [x] Featured picks in core (`services/apps/featured.ts`)
- [x] Active time per app and goals on the app page
- [x] Docs: system apps (App Store), apps service, persistence; changelog in 3.74.0
- [ ] Hot updates (ADR-077 stage 3): Updates should read "Update ready" from StoreService once it exists

## Next session topics
- Screenshots: no manifest has a `preview` yet; the app page shows it when one does.
- An achievements API for apps (roadmap).
