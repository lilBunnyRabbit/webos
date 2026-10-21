# VersionService

Key `version` · Depends on: `files`, `notifications`, `dialogs`, `apps`, `session` · ADR: [ADR-004](../../adrs/004-version-update-system.md), [ADR-026](../../adrs/026-release-notes-intro.md), [ADR-038](../../adrs/038-app-announcements.md), [ADR-041](../../adrs/041-getting-started.md) (samples), [ADR-047](../../adrs/047-solo-app-open.md) (solo), [ADR-049](../../adrs/049-lazy-app-metadata.md) (waits for app meta) · Source: `src/lib/core/api/services/version/`, `src/lib/core/components/intro/`, `src/lib/core/components/announcement/`, `src/lib/core/components/update/`, `src/lib/core/utils/install{,.svelte}.ts`, `vite-plugin-version.ts` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Knows which build is running and detects when a newer build has been deployed, by polling `{BASE_URL}version.json`. It can also apply the update: install the new service worker, then reload into the new build. It owns the release notes (`changelog.ts`), remembers which release this device last saw, and shows the full-screen introduction on first boot (ADR-026). The release notes also record which apps each line is about and which release introduced each app; after an update, the apps it introduced are announced (ADR-038).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `info` | `info: VersionInfo` | The running build. Initialized from `BUILD_INFO` (`build-info.ts`), the only reader of the compile-time constant `__VERSION_INFO__`; it changes every build, so it stays out of the shared `core` chunk ([overview](../overview.md#build--deploy)). `$state`, but never reassigned. |
| `update_available` | `update_available: VersionInfo \| null` | The remote info, set when `remote.buildTimestamp > info.buildTimestamp`. Never reset to `null`. |
| `is_checking` | `is_checking: boolean` | True while a `check()` is in flight. |
| `check` | `check(): Promise<void>` | Re-entrancy guarded: returns at once if a check is already running. Fetches `${import.meta.env.BASE_URL}version.json` (`/webos/version.json` in production) with `cache: "no-store"`. A non-OK response is ignored silently. Network or parse errors go to `console.error`. Never throws. |
| `apply_update` | `apply_update(): Promise<void>` | Walks `update_stage` through `installing` → (`clearing`) → `reloading` while the update overlay shows it. `registration.update()`; (15 s timeout); a new worker that activates means a reload into its precache, with `update_progress` following its download meanwhile. No new worker, a timeout, a stall, Restart now or an error falls through to clearing: unregister this app's registration and delete only Cache Storage keys containing its scope (`scope_caches`, `update.ts`). Every path ends in `location.replace(?__upd=<now>)`; `init()` strips the parameter again. A second call while one runs is ignored. See [Service worker](#service-worker). |
| `update_stage` | `UpdateStage` (`idle` \| `installing` \| `clearing` \| `reloading`) | `$state`, read by `components/update/update-overlay.svelte` in `os.svelte` |
| `update_progress` | `UpdateProgress \| null` | `$state`. `{ started, done, total, slow }` while `installing`, `null` in every other stage. `total` is the number of files the new worker downloads, `null` until its manifest is read (or when it can't be); `slow` turns true after 8 s. See [Update progress](#update-progress) |
| `restart_update` | `restart_update(): void` | The overlay's Restart now: stops waiting for the new worker and runs the clearing path. No-op outside `installing` |
| `changelog` | `Release[]` | `$state.raw`, empty until `load_changelog()` resolves, then `CHANGELOG` from `changelog.ts`, newest first |
| `load_changelog` | `(): Promise<Release[]>` | Imports `changelog.ts` once (the promise is kept) and fills `changelog`. `init()` awaits it only after an update; Settings › What's new, App Library and the `changelog` command call it themselves. It's the largest module WebOS has and grows every release, so it stays out of the boot chunk |
| `unseen` | `Release[]` | `$state`. Releases newer than the seen marker read at boot and not newer than `info.version`. Set once in `init()`, kept for the session |
| `announced` | `AppIntroduction[]` | `$state`. `introduced_apps(unseen)` limited to registered apps (installed or not; Open installs through `launch`): what the announcement shows. Set once in `init()`, kept for the session; empty on first boot |
| `show_intro` | `show_intro(): Promise<void>` | Imports `intro-dialog.svelte` and awaits the apps' `meta_ready` (ADR-049: the suggestions show descriptions), then `dialogs.show(IntroDialog, {}, { dismissible: false })`. On first boot `init()` awaits both before returning, so the introduction is up when the splash goes (ADR-036); only a first boot waits for the `app-meta` chunk. Resolves when it closes. Doesn't write the seen marker |
| `init` / `destroy` | | See Lifecycle. |
| `to_string` | | `VersionService: v{version} ({commit})` |

```ts
interface VersionInfo {
  version: string;        // package.json "version"
  commit: string;         // git short hash, or "unknown"
  branch: string;         // git branch, or "unknown"
  buildTime: string;      // ISO string
  buildTimestamp: number; // ms epoch; the only field compared
}
```

```ts
const ChangeKind = { NEW: "new", IMPROVED: "improved", FIXED: "fixed" } as const;
interface Change { kind: ChangeKind; text: string; apps?: AppId[] }        // apps: whose history the line belongs to
interface Release { version: string; date: string /* YYYY-MM-DD */; title: string; changes: Change[]; introduces?: AppId[] }
interface AppIntroduction { app: AppId; release: Release }
```

`buildTime` and `buildTimestamp` are camelCase on purpose. They're the deployed wire format ([CONVENTIONS → Naming](../../CONVENTIONS.md#naming)).

## Where the data comes from

`vite-plugin-version.ts` → `version_plugin()`, registered in `vite.config.ts`:

| Hook | Effect |
|------|--------|
| `config()` | Calls `get_version_info()` **once** and keeps the result. Defines `__VERSION_INFO__` as that JSON, so it's baked into the bundle in dev and in build. |
| `configResolved()` | Records `build.outDir` (resolved against root). |
| `closeBundle()` (build) | Writes the same stamp to `{outDir}/version.json`. |
| `configureServer()` (dev) | Middleware answers `{base}version.json` (the resolved Vite `base`) with the same stamp, `Cache-Control: no-store`. |

The bundle and `version.json` always carry the same `buildTimestamp`. Only a new build (or a dev server restart) produces a newer one.

`get_version_info()` reads `package.json`, runs `git rev-parse --short HEAD` and `--abbrev-ref HEAD` (falling back to `"unknown"`), and stamps `new Date()`.

## State

Seven `$state` fields (`info`, `update_available`, `is_checking`, `update_stage`, `update_progress`, `unseen`, `announced`), `changelog` as `$state.raw`, and private `restart` (resolves the current wait as given up), `loading` (the kept `load_changelog()` promise), `last_check` (ms), `notified_build` (the `buildTimestamp` last toasted), `update_toast`, `poll_interval`, `destroyed`, `dispose_announcement`, `writer` (`LatestWriter` for the seen marker). Nothing derived.

## Lifecycle

`init()`:

- `setInterval(check, 30 min)`
- `document.addEventListener("visibilitychange", …)`: when the tab becomes visible and more than 60 s have passed since `last_check`, it runs `check()`.
- `update/load-failed.svelte` (a window or widget whose app chunk failed to import) runs `check()` immediately and offers `apply_update()` in place, so a stale tab after a deploy doesn't wait for the 30-minute poll.
- `window.addEventListener("vite:preloadError", …)`: any lazy chunk that fails to load (dialogs, shell command bodies, app sections) runs `check()` and, with a newer build found, shows the "A new version is ready" toast again even if this build was already announced. `update_toast` keeps one such toast: a new one dismisses the previous, so chunks failing together don't stack copies. The failing caller still reports its own error.

- Reads `/var/lib/version/state.json` and branches, see [Release notes and introduction](#release-notes-and-introduction). The introduction is requested without awaiting, like Restore. A first boot also lazily imports `samples.ts` and runs `seed_samples(files)` (ADR-041), unawaited: it creates `/home/Documents/Samples` with `Welcome.md`, `Bouncing ball.hopsprite` (generated: 16×16, six frames, one `bounce` tag; a Hopsprite test parses it), `Fruit.csv` and `Sunset.svg`, one file per kind of app. A failure is logged only. Existing devices get them from Getting started's "Open the samples", which runs `seed_samples` when the folder is missing.

`destroy()` clears the interval, removes the listener, stops a pending introduction from writing the marker, and disposes the wait for the Restore answer.

In solo mode `SoloVersionService` (`version/solo.svelte.ts`, ADR-047) replaces this class with an empty `init()`: no polling, no listeners, no introduction, no samples, no notices, and the seen marker isn't written, so the person's own WebOS still shows what's new. Changelog loading and `check()` still work on demand.

No check runs at boot. The first check happens on the first tab-visible event (`last_check` starts at `0`), on the 30-minute tick, or when the Settings app button is clicked.

## Consumers

- Settings › About: `info`, "Check now" / "Update and reload", "Show again" (`show_intro()`). Update checks are disabled in dev. Its Install row reads `installer` directly (see [Install](#install)).
- Settings › What's new: `load_changelog()` on mount, `changelog`, `unseen`, `info.version`.
- App Library: `load_changelog()` at init, `changelog` (History section, Recently added / updated sort through `app_history` and `recency`) and `unseen` (session-only New / Updated badges through `introduced_apps` and `updated_apps`).
- Its own toasts (below).

## Release notes and introduction

A release is a `package.json` version bump plus an entry at the top of `changelog.ts` (ADR-026). The rule for agents is in CLAUDE.md. Versions compare numerically per `major.minor.patch` (`semver.ts`).

At boot (`init()`), after reading the seen marker:

| Marker | What happens |
|--------|--------------|
| missing or invalid | `show_intro()`. When it closes, `seen = info.version` is written |
| `seen >= info.version` | Nothing |
| `seen < info.version` | Awaits `load_changelog()`, then `unseen` = releases in `(seen, info.version]`. `seen = info.version` is written at once. If `unseen` isn't empty: sticky toast "Updated to v{version}", message "3 new · 1 improved · 2 fixed" (only kinds present), action "What's new" → `apps.launch("settings", { section: "whats-new" })` |

### App history and announcements (ADR-038)

`history.ts` holds the pure helpers, exported from the barrel and unit-tested (`history.test.ts`, which also checks every id the changelog names is an app folder, every app is introduced at most once, and each introduced app has a tagged line in its release):

| Function | Returns |
|----------|---------|
| `app_history(changelog, app)` | `{ added, updated, changes }`: the release that introduces it (`null` if none does), the newest later release with a tagged line, and every tagged line newest first |
| `introduced_apps(releases)` | `AppIntroduction[]`, each app once, in the releases' order |
| `updated_apps(releases)` | `Set<AppId>` tagged in those releases but not introduced by them |
| `recency(changelog, app)` | Index of the newest release that introduces or tags it, `Infinity` for never |

Tagging rules for `changelog.ts`: `apps` names the apps whose own UI or own commands the line is about. Shell-wide, launcher and desktop lines stay untagged, as do lines about a service (backups, tasks) rather than an app. A line about a retired app is tagged with its successor (Image Tools' history keeps the five image apps' lines; Text Viewer's lines belong to `text-editor`). `introduces` lists apps first shipped in that release; Style Guide and Example were never announced and have none.

Announcement: when `announced` isn't empty, `init()` starts an `$effect.root` that waits for `session.status !== PENDING` (RouterService's pattern), so an app opened from it lands above the restored windows. It then imports `components/announcement/app-announcement.svelte` and, in parallel, awaits the apps' `meta_ready` (ADR-049), then takes each announced app from `apps.listings()`, so it arrives with its description and authors; then calls `dialogs.show(AppAnnouncement, { apps })` once, dismissible (Esc, outside click, the phone's Back). Nothing is persisted: it shows once because the seen marker moves at boot. The component loads every paged app's `preview` and `highlights` in one await and renders the card only then, so it opens at full size instead of growing (separate `{#await}` blocks rendered empty for a frame). The "Updated to vX" toast still shows. First boot shows the introduction and no announcement.

`AppAnnouncement` (`{ apps: { manifest, version }[] }`):

| Apps | Layout |
|------|--------|
| 1–4 | A page per app: a primary glow, "New app" badge, the icon in a large tile, name, category · since v{version}, the "By …" byline (`AppByline`), description, the manifest `preview` (lazy image) and `highlights` cards when present, then a recessed strip "Start menu › {category}" and `app launch {id}`. Footer: dots (when more than one; ←/→ also page), **Later** (quiet: next page, or close on the last) and **Open {name}** (primary, autofocused: launches, then next page or close). A close button sits top right |
| 5 or more | One list page, "N new apps": a row per app with icon, name, version and description, and an Open button that turns into "Opened". Footer: Later, or Done once something was opened |

A centred card on `background-lighter` (`rounded-2xl`, `w-[36rem]`, capped at the viewport height with its body scrolling), container queries inside, so the phone gets the same component in one column. The Style Guide (Feedback) renders it in place with `inline` (no autofocus) and shows it as a dialog.

When `check()` finds a newer build: one sticky toast per build (`notified_build`), "A new version is ready", "v{x}. WebOS reloads and offers your open windows back.", action "Update and reload" → `apply_update()`. Skipped in dev. The release notes stay hidden until after the reload, since the old bundle can't know them.

Both toasts use app id `version`, so they're in the notification history.

### `IntroDialog`

`components/intro/intro-dialog.svelte`, a full-viewport takeover (`fixed inset-0`, `background-darkest` with a `background-dark` glow at the top), shown as a non-dismissible system dialog ([dialogs](dialogs.md#third-consumer-introdialog)). Esc does nothing; Skip (top right, on every page but the last) resolves.

| Page | Content |
|------|---------|
| Hello | Logo mark, "Welcome to WebOS", one-line pitch. Button "Get started" |
| Install | "Install WebOS first". One highlighted card (`ring-2 ring-primary/40`): why it matters in two lines (own window and offline; installed apps' storage is far less likely to be cleared), then the [install](#install) state: primary "Install WebOS" button, "Installed" in `success`, or the platform hint |
| Your files | Four cards: stored on this device, one browser one disk, Save to disk, clearing site data deletes them (`warning` tile) |
| Getting around | Start menu, windows (drag, snap, double-click), right-click menus, the desktop folder. Keyboard line with `Kbd`s |
| Apps | "What are you into?" (ADR-040). A first boot has only the system apps; four interest toggles (secondary buttons, primary tint when picked; `INTERESTS` in `services/apps/suggestions.ts`: Create, Get things done, Play, Build) list their apps as cards (icon, name, first highlight or the description) with a Pin toggle ("Add" on mobile). Skip and Start both install the picked groups (`apps.install`) and pin the toggled apps among them (`desktop.pin`). Replaying it only adds |
| Make it yours | `ThemeCard` grid of `THEME_PRESETS` and a taskbar `Segmented`, both writing `settings` live |
| Ready | Updates, windows come back, work in progress, replay from About. Button "Start using WebOS" |

Paging: Back/Next, dot buttons, and ←/→ on `window` (ignored inside inputs and radio groups). Each page enters with `animate-pop-in`, keyed on the page. The primary button carries `autofocus`. Cards switch to two columns at `@xl` of the content column. Display sizes `text-2xl`/`text-3xl` are used only here.

### Install

`src/lib/core/utils/install.svelte.ts` exports `installer`, a module singleton, not a service: `beforeinstallprompt` fires once, early, so `main.ts` imports the module before `kernel.init()` and the listener is live before the introduction mounts. Pure detection is in `install.ts` (unit-tested).

| Member | Notes |
|--------|-------|
| `can_install` | A `beforeinstallprompt` event is held (`preventDefault()`ed) and WebOS isn't installed |
| `installed` | `matchMedia("(display-mode: standalone)")` (live), iOS `navigator.standalone`, or `appinstalled` / an accepted prompt this session |
| `platform_hint` | `prompt` (the API exists), `ios` (any iOS browser, iPadOS posing as a Mac), `safari-mac`, `other`. `$state` only so a test can stub it |
| `hint` | `INSTALL_HINTS[platform_hint]`: Install app in the address bar or menu; Share › Add to Home Screen; File › Add to Dock; the browser's Install app / Add to Home Screen |
| `install()` | `Promise<"accepted" \| "dismissed" \| "unavailable">`. Shows the held prompt once (the event is dropped either way) and returns `userChoice.outcome`. Needs a user gesture |

Consumers: the Install page of the introduction, Settings › About › Install, and the `install` command. Nothing is persisted.

The manifest (`VitePWA` in `vite.config.ts`) has what Chromium needs: `name`, `short_name`, 192 and 512 icons plus a maskable 512, and vite-plugin-pwa's defaults `start_url` and `scope` = `/webos/`, `display: "standalone"`.

## Persistence

`/var/lib/version/state.json`: `{ "version": 1, "seen": "0.8.0" }` (`persistence.ts`, zod, written through `LatestWriter`). The Workbox precache in Cache Storage belongs to the service worker ([persistence.md](../persistence.md)); `apply_update()` swaps it, and deletes this app's caches only on the fallback path (other `lilbunnyrabbit.github.io` apps share the origin, so it never touches theirs).

## Behaviour & invariants

- The comparison is strictly on `buildTimestamp`. Version string and commit are display-only.
- In dev, an update shows up only after the dev server restarts (vite also restarts it when config changes) while an old tab is still open. The UI hides the panel behind `!import.meta.env.DEV` anyway.
- The URL is built from `import.meta.env.BASE_URL`, so it follows Vite `base` (`/webos/`, the GitHub Pages project path).

## Service worker

Production builds register a Workbox SW through `VitePWA({ registerType: "autoUpdate" })` in `vite.config.ts` (`sw.js`, `workbox-*.js`, plus `registerSW.js` injected into `index.html`). The PWA is a goal in its own right: installable, standalone, offline. The manifest's `theme_color` and `background_color` are both Brand Dark `#17252C`, so a standalone launch doesn't flash white. Dev registers no SW.

Who does what:

- **The SW** precaches the app shell (`js`, `mjs`, `css`, `html`, `woff2`, plus `includeAssets` and the manifest icons) and serves it, so the app boots offline. The codec `.wasm` (AVIF, JPEG XL; 2–3.5 MB each) and Shopping List's text reader (ONNX Runtime's 14 MB wasm and the 4.8 MB and 8 MB `.onnx` models) are left out of the precache so an install doesn't download them. A `CacheFirst` runtime rule (`runtimeCaching`, `.wasm` and `.onnx`) keeps each one in the `webos-wasm` cache the first time an app loads it, so those formats and reading a list from a photo then work offline. `maxEntries: 16` bounds it: the file names are content-hashed, so a release with new wasm adds entries and the oldest fall out. With `autoUpdate` the new worker skips waiting and claims open clients as soon as it installs. The browser also checks for a new `sw.js` on its own (on navigation, at most daily otherwise).
- **VersionService** decides *when the user is told*. `version.json` isn't precached and is fetched with `no-store`, so `check()` always sees the deployed build. Offline, the fetch fails and logs.
- **`apply_update()`** bridges them. A plain reload would boot the old build from the precache. So it calls `registration.update()` to fetch the new `sw.js`, waits for that worker to activate (it skips waiting and claims this page), and only then reloads. The reload is served from the new precache, and offline keeps working afterwards.
- **Fallback (2026-10-12).** GitHub Pages' CDN can keep serving the old `sw.js` for minutes after `version.json` changed. Then `update()` finds nothing, and the old flow reloaded into the same build, so "Update and reload" looked like it did nothing. Now that case unregisters this app's worker, deletes its scoped caches and reloads with a cache-busting query, so the next boot comes from the network and registers the new worker. Modelled on series-tracker's `applyUpdate`, minus its origin-wide wipe.

If the browser already installed the new worker before the click, `installing` and `waiting` are both `null`, so it takes the fallback path: unregister, clear this app's caches, reload from the network. Slower than needed, but it ends on the new build either way.

### Update progress

Why it was slow: a release renamed most of the precache (606 of 765 files, about 5 MB, for a one-line change; see the [slow updates brainstorm](../../brainstorm/2026-10-21_slow-updates.md)). Since the `core` chunk and its import map ([overview](../overview.md#build--deploy)) a release renames about 17 files, but Workbox's install fetches them **one at a time** (`PrecacheController.install`, workbox#2528), storing each in the precache cache as it lands and skipping any key already there.

So the progress is read from Cache Storage, with no change to the worker (`precache.ts`, pure, unit-tested; the loop is `track_install` in the service):

1. Before `registration.update()`, snapshot the keys of `workbox-precache-v2-{scope}` (`precache_cache_name`). The install starts as soon as `sw.js` arrives, so a later snapshot would miss files.
2. Once there's a new worker, fetch its `scriptURL` (`cache: "no-cache"`; the old worker doesn't route it) and read the manifest out of `precacheAndRoute([{url:"…",revision:…}, …])` (`parse_precache_manifest`, a regex over `generateSW`'s output). Each entry's cache key mirrors Workbox's `createCacheKey` (`precache_key`: resolved against the script URL, `?__WB_REVISION__=` when it has a revision). The keys missing from the snapshot are the download (`keys_to_download`) and set `total`.
3. Every 400 ms, count how many of them the cache now holds (`count_cached`) into `done`.

Only files are counted, not bytes: the manifest Workbox writes has no sizes (workbox-build deletes `size` before writing it), and summing Content-Length or blob sizes would still leave the total unknown. If the manifest can't be parsed, `total` stays `null` and the overlay shows only the elapsed time.

Timing (constants in `service.svelte.ts`):

| Constant | Value | Effect |
|----------|-------|--------|
| `UPDATE_TIMEOUT` | 15 s | `registration.update()` (only fetches `sw.js`) gives up; clearing path |
| `SLOW_AFTER` | 8 s | `slow` turns true: the overlay shows "Still downloading…" and Restart now |
| `STALL_TIMEOUT` | 20 s | No new file has landed for this long while files remain: gives up; clearing path |
| `INSTALL_LIMIT` | 120 s | Hard upper bound on the whole wait, progress or not; clearing path |

A worker that activates at any point before those reloads as before. Restart now and the automatic give-ups resolve the same `given_up` promise the activation races against; the `finally` aborts the polling and clears the timers. A worker that goes `redundant` rejects and also clears. The clearing path wipes the precache, so the next boot downloads it again in the background; that's why the wait is patient as long as files keep landing.

`UpdateOverlay` (`components/update/update-overlay.svelte`, in `os.svelte`, so both shells) keeps the three-step list. Under the active "Downloading the new version" step it shows a `role="progressbar"` (`bg-primary` on `bg-foreground/12`, the same inline bar as Getting started and toasts) once `total` is known, and a mono line `progress_line()`: "212 of 606 files · 14 s", or only "14 s" while the total is unknown or zero. Elapsed seconds tick from a local 1 s interval. With `slow`, a short text and a secondary **Restart now** button sit under the list.

## Divergence from ADR

- ADR-004 originally rejected a service worker; its revision note accepts the SW and the cooperation above.
- ADR-004 calls for a `CHANGELOG.md` fetched at runtime. ADR-026 replaced it with the bundled, typed `changelog.ts` (ADR-004 revision note).
- ADR-038 limits `announced` to installed apps. The code keeps every introduced app that is still registered, installed or not, so Open installs it (ADR-040). Revision note 2026-10-18; the `announced` JSDoc in `type.ts` still says "Installed apps".

## Shell

Contributes `version`, `changelog`, `install` and the `release` and `new-app` value types (`version/shell.ts`). `changelog --changes` (`-c`) yields one untagged row per change (version, kind, text). `changelog --apps` yields one `new-app` row per introduced app that is still registered (id, name, added, date), newest release first; clicking a row launches the app. `new-app` is its own type because `app`'s columns (id, name, category) would hide when it came; the command's `yields` stays `release`, so `where` after `--apps` completes release columns. `install` is `available()` only while not installed; it yields the platform hint when no prompt is held, otherwise "Installing…" then "Installed." or "Install dismissed.". See [shell](shell.md#contributions).

## Known gaps

- With two tabs open, the first to boot writes the seen marker; the other shows no toast.
- A browser tab of an already installed WebOS gets no prompt event and isn't standalone, so it shows the hint instead of "Installed".

- `update_available` is never cleared, even if a later check finds nothing newer.
- The SW can activate a new build in the background (the browser's own update check) while a tab still runs the old one. Nothing tells VersionService. The banner still appears on the next `check()`, and the tab keeps running old code until reloaded.
- Progress counts files, not bytes; a few large chunks can make the bar move unevenly.
- The manifest is read with a regex over `generateSW`'s minified output. A Workbox upgrade that writes it differently leaves only the elapsed time (no error).
