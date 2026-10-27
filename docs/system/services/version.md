# VersionService

Key `version` · Depends on: `files`, `notifications`, `dialogs`, `apps`, `session`, `settings` · ADR: [ADR-004](../../adrs/004-version-update-system.md), [ADR-026](../../adrs/026-release-notes-intro.md), [ADR-038](../../adrs/038-app-announcements.md), [ADR-041](../../adrs/041-getting-started.md) (samples), [ADR-047](../../adrs/047-solo-app-open.md) (solo), [ADR-049](../../adrs/049-lazy-app-metadata.md), [ADR-077](../../adrs/077-app-store.md) (catalogue for the intro and announcements, overlay notes), [ADR-070](../../adrs/070-usage-analytics.md) (usage stats ask) · Source: `src/lib/core/api/services/version/`, `src/lib/core/components/intro/`, `src/lib/core/components/announcement/`, `src/lib/core/components/update/`, `src/lib/core/utils/install{,.svelte}.ts`, `tooling/vite-plugin-version.ts` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Knows which build is running and detects when a newer build has been deployed, by polling `{BASE_URL}version.json`. It can also apply the update: install the new service worker, then reload into the new build. It owns the release notes (`changelog.ts`), remembers which release this device last saw, and shows the full-screen introduction on first boot (ADR-026). The release notes also record which apps each line is about and which release introduced each app; after an update, the apps it introduced are announced (ADR-038).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `info` | `info: VersionInfo \| null` | The running release, `$derived` from `apps.header` (`release_info`, `release.ts`): `version` is the catalogue's `release`, `buildTimestamp` its `build`, `buildTime` that stamp as ISO, `commit` and `branch` the catalogue's (`"unknown"` in a slice written before 2026-10-27). Nothing about the release is in the bundle, so an app-only deploy renames no core file ([overview](../overview.md#build--deploy)); `info` moves when an app-only update is taken. `null` while no catalogue of the running core is known: offline on a release's first boot with only the old core's slice. Then About says "Known once online", the start menu footer and badges hide, and the first online check fills it. |
| `update_available` | `update_available: RemoteVersion \| null` | The remote `version.json` (`VersionInfo` plus `core` and `notes`, both optional: older builds wrote neither), set when `remote.buildTimestamp > info.buildTimestamp` and its `core` isn't the running one (a core update). Never reset to `null`. |
| `is_checking` | `is_checking: boolean` | True while a `check()` is in flight. |
| `check` | `check(): Promise<void>` | Re-entrancy guarded: returns at once if a check is already running, or when `navigator.onLine` is false. Fetches `${import.meta.env.BASE_URL}version.json` (`/webos/version.json` in production) with `cache: "no-store"`. A non-OK response or a fetch that fails (offline, unreachable) is ignored silently; the next poll asks again. A parse error or anything else goes to `console.error`. Never throws. |
| `apply_update` | `apply_update(): Promise<void>` | Walks `update_stage` through `installing` → (`clearing`) → `reloading` while the update overlay shows it. `registration.update()`; (15 s timeout); a new worker that activates means a reload into its precache, with `update_progress` following its download meanwhile. No new worker, a timeout, a stall, Restart now or an error falls through to clearing: unregister this app's registration and delete only Cache Storage keys containing its scope (`scope_caches`, `update.ts`). Every path ends in `location.replace(?__upd=<now>)`; `init()` strips the parameter again. A second call while one runs is ignored. See [Service worker](#service-worker). |
| `update_stage` | `UpdateStage` (`idle` \| `installing` \| `clearing` \| `reloading`) | `$state`, read by `components/update/update-overlay.svelte` in `os.svelte` |
| `update_progress` | `UpdateProgress \| null` | `$state`. `{ started, done, total, slow }` while `installing`, `null` in every other stage. `total` is the number of files the new worker downloads, `null` until its manifest is read (or when it can't be); `slow` turns true after 8 s. See [Update progress](#update-progress) |
| `restart_update` | `restart_update(): void` | The overlay's Restart now: stops waiting for the new worker and runs the clearing path. No-op outside `installing` |
| `changelog` | `Release[]` | `$derived`, empty until `load_changelog()` has run, then `store/changelog.json` plus the releases `version.json` brought (`with_notes`, `history.ts`: a copy fetched earlier or offline lacks them), newest first, cut at `info.version` (`running_changelog`): the deployed file runs ahead of a tab while a core update waits. |
| `load_changelog` | `(): Promise<Release[]>` | Fetches `{base}store/changelog.json` (`fetch_changelog`, `release.ts`, `cache: "no-cache"`; the service worker's `NetworkFirst` `store/` rule keeps the last copy for offline) once and keeps the promise. A failure (offline with no copy) leaves `changelog` to the notes and drops the promise, so the next call asks again. `init()` awaits it only after an update; Settings › What's new, App Store and the `changelog` command call it themselves. The build writes the file from `changelog.ts` at a fixed name, so a new line renames nothing |
| `unseen` | `Release[]` | `$state`. Releases newer than the seen marker read at boot and not newer than `info.version`. Set once in `init()`, kept for the session |
| `announced` | `AppIntroduction[]` | `$state`. `introduced_apps(unseen)` limited to registered apps, installed or not (Open runs one through `launch`, which doesn't install it): what the announcement shows. Set once in `init()`, kept for the session; empty on first boot |
| `show_intro` | `show_intro(): Promise<void>` | Imports `intro-dialog.svelte` and awaits `apps.catalogue()` (ADR-077: its interests suggest apps that aren't installed, with their descriptions), then `dialogs.show(IntroDialog, {}, { dismissible: false })`. On first boot `init()` awaits both before returning, so the introduction is up when the splash goes (ADR-036); a first boot already fetched the catalogue while AppsService initialized, so that await is instant. Resolves when it closes. Doesn't write the seen marker |
| `pipeline` | `pipeline(signal?: AbortSignal): Promise<Pipeline \| null>` | The newest Actions run on `master` of `lilBunnyRabbit/webos` and its jobs (`pipeline.ts` `fetch_pipeline`). Two unauthenticated calls to `api.github.com` (`/actions/runs?branch=master&per_page=1`, then `/runs/{id}/jobs`), answered with CORS; no token, no state, nothing stored. GitHub allows 60 calls an hour per IP, so one call costs 2 of them. Throws on a non-OK answer; a used-up limit throws "GitHub's hourly limit is used up until HH:MM" from `x-ratelimit-reset`. `null` when there is no run. Solo inherits it |
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

const PipelineState = { QUEUED, RUNNING, SUCCESS, FAILURE, CANCELLED, SKIPPED } // pipeline_state(status, conclusion)
interface PipelineJob { name: string; state: PipelineState; started: number | null; completed: number | null; url: string }
interface Pipeline { state: PipelineState; sha: string; title: string; created: number; url: string; jobs: PipelineJob[] }
```

`pipeline.ts` also exports `is_settled(state)`, `is_this_build(pipeline, commit)` (the full sha starts with the build's short hash) and `format_took(ms)` (`38s`, `4m 12s`, `1h 3m`).

`buildTime` and `buildTimestamp` are camelCase on purpose. They're the deployed wire format ([CONVENTIONS → Naming](../../CONVENTIONS.md#naming)).

## Where the data comes from

`tooling/vite-plugin-version.ts` → `version_plugin()`, registered in `vite.config.ts`:

| Hook | Effect |
|------|--------|
| `config()` | Calls `get_version_info()` **once** and keeps the result. Defines `__VERSION_INFO__` as that JSON, read only by `build-info.ts`, which only the dev server's and tests' glob catalogue (`apps/glob-source.ts`) imports. A build fails if any chunk holds `build-info.ts` or `changelog.ts` (`RELEASE_MODULES`, `tooling/vite-plugin-catalogue.ts`). |
| `configResolved()` | Records `build.outDir` (resolved against root). |
| `closeBundle()` (build) | Writes the same stamp to `{outDir}/version.json`, plus the catalogue plugin's fields. Builds only: a dev server's close writes nothing. |
| `configureServer()` (dev) | Middleware answers `{base}version.json` (the resolved Vite `base`) with the same stamp and fields, `Cache-Control: no-store`. |

`version_plugin(info, extra)` merges what `extra()` resolves to; `vite.config.ts` passes the catalogue plugin's `version_fields` (ADR-077 stage 2, [overview](../overview.md#build--deploy)). `version.json` then holds:

| Field | Value |
|-------|-------|
| `version`, `commit`, `branch`, `buildTime`, `buildTimestamp` | The stamp above. |
| `core` | The core hash: what a new service worker would precache, normalized so a rebuild of the same tree gives the same value. `"dev"` on the dev server. |
| `notes` | `{ version, date, title, changes: [{ kind, text }] }[]`: the top `CHANGELOG` release plus every release newer than the deployed catalogue's `release`. On the dev server, or without a previous catalogue, the top release only. |

The update overlay shows `notes` ([below](#update-progress)); `check()` compares `core` with the running one ([below](#app-only-updates)).

`version.json` and `store/catalogue.json` always carry the same stamp (`buildTimestamp` is the catalogue's `build`, `version` its `release`; the catalogue also carries `commit` and `branch`). Only a new build (or a dev server restart) produces a newer one. The catalogue plugin also writes `store/changelog.json`, the whole `CHANGELOG` as JSON; the dev server answers it from `changelog.ts`.

`get_version_info()` reads `package.json`, runs `git rev-parse --short HEAD` and `--abbrev-ref HEAD` (falling back to `"unknown"`), and stamps `new Date()`.

## App-only updates

ADR-077 stage 3. `check()` finds a newer `buildTimestamp`, then compares `remote.core` with `running_core()` (the `<meta name="webos-core">` the build wrote into `index.html`, `"dev"` on the dev server):

- **Same core**: only apps changed. No toast, no overlay, no reload: the release's `notes` join `changelog` (`take_notes`) and `apps.refresh(remote.buildTimestamp)` takes the new catalogue, which skips the fetch once it holds that build. StoreService downloads the changed installed apps and toasts "Snake and 2 more updated" ([store](store.md#hot-updates-adr-077-stage-3)). Open windows of a changed app show Update ([window](../shell/window.md)).
- **Another core, or no `core`** (an older build): today's full update, `update_available`, the "A new version is ready" toast and the overlay.

`info` follows: `apps.refresh` sets `apps.header` to the new catalogue's, so Settings › About, the start menu and the overlay's "from" version show the accepted release at once, and `changelog` reaches it. The deploy changed nothing the service worker precaches, so the browser's own update check finds the same `sw.js`. Measured 2026-10-27 (build N, then N+1 with a Snake edit, a patch bump and a changelog line): `sw.js` byte-identical, precache manifest identical (202 entries), core hash identical, 0 core files renamed; only Snake's two chunks were new, plus `version.json`, `store/*.json` and `offline/*.json`. A core edit on top changed `sw.js` and the core hash as before. The seen marker isn't moved by an app-only update: the next boot says "Updated to v…" for it, as before.

## State

Six `$state` fields (`update_available`, `is_checking`, `update_stage`, `update_progress`, `unseen`, `announced`), two `$derived` (`info` from `apps.header`, `changelog`), and private `loaded` (`$state`), `fetched` and `notes` (`$state.raw`: the fetched changelog and what `version.json` brought), `restart` (resolves the current wait as given up), `loading` (the kept `load_changelog()` promise), `last_check` (ms), `notified_build` (the `buildTimestamp` last toasted), `update_toast`, `poll_interval`, `destroyed`, `disposers` (the after-Restore effect roots), `writer` (`LatestWriter` for the seen marker).

## Lifecycle

`init()`:

- `setInterval(check, 30 min)`
- `document.addEventListener("visibilitychange", …)`: when the tab becomes visible and more than 60 s have passed since `last_check`, it runs `check()`.
- `update/load-failed.svelte` (a window or widget whose app chunk failed to import) runs `check()` immediately and offers `apply_update()` in place, so a stale tab after a deploy doesn't wait for the 30-minute poll.
- `window.addEventListener("vite:preloadError", …)`: any lazy chunk that fails to load (dialogs, shell command bodies, app sections) runs `check()` and, with a newer build found, shows the "A new version is ready" toast again even if this build was already announced. `update_toast` keeps one such toast: a new one dismisses the previous, so chunks failing together don't stack copies. The failing caller still reports its own error.

- Reads `/var/lib/version/state.json` and branches, see [Release notes and introduction](#release-notes-and-introduction). The introduction is requested without awaiting, like Restore. A first boot also lazily imports `samples.ts` and runs `seed_samples(files, manifests)` (ADR-041), unawaited: it creates `/home/Documents/Samples` with `Welcome.md`, `Bouncing ball.hopsprite` (generated: 16×16, six frames, one `bounce` tag; a Hopsprite test parses it), `Fruit.csv`, `Sunset.svg` and `Burrow.fontmaker`, one file per kind of app. Only files a registered app opens are written (`apps_for` on the name and a MIME type), and `Welcome.md` lists only those, so a fork without the user apps gets just the CSV, the SVG and the welcome. A failure is logged only. Existing devices get them from Getting started's "Open the samples", which runs `seed_samples` when the folder is missing.

`destroy()` clears the interval, removes the listener, stops a pending introduction from writing the marker, and disposes the wait for the Restore answer.

In solo mode `SoloVersionService` (`version/solo.svelte.ts`, ADR-047) replaces this class with an empty `init()`: no polling, no listeners, no introduction, no samples, no notices, and the seen marker isn't written, so the person's own WebOS still shows what's new. Changelog loading and `check()` still work on demand: the solo shell runs `check()` on a broken link and offers the update in place ([solo shell](../shell/solo.md)).

`init()` starts one check at boot, not awaited, because a boot can be served from the precache of an older build. After that it checks when the tab becomes visible (throttled to once a minute through `last_check`), on the 30-minute tick, or when the Settings app button is clicked.

## Consumers

- Settings › About: `info`, "Check now" / "Update and reload", "Show again" (`show_intro()`). Update checks are disabled in dev. Its Install row reads `installer` directly (see [Install](#install)). Its Pipeline section calls `pipeline()`.
- Settings › What's new: `load_changelog()` on mount, `changelog`, `unseen`, `info.version`.
- App Store: `load_changelog()` at init, `changelog` (History section, Recently added / updated sort through `app_history` and `recency`) and `unseen` (session-only New / Updated badges through `introduced_apps` and `updated_apps`).
- Its own toasts (below).

## Release notes and introduction

A release is a `package.json` version bump plus an entry at the top of `changelog.ts` (ADR-026). The rule for agents is in CLAUDE.md. Versions compare numerically per `major.minor.patch` (`semver.ts`).

At boot (`init()`), after reading the seen marker:

| Marker | What happens |
|--------|--------------|
| missing or invalid | `show_intro()`. When it closes, `seen = info.version` is written |
| `seen >= info.version` | Nothing |
| `info` is `null` | Nothing, and the marker stays: the next boot online says what's new |
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

Announcement: `init()` sets `announced` to every app an unseen release introduces and, when there's any, starts an `$effect.root` that waits for `session.status !== PENDING` (RouterService's pattern), so an app opened from it lands above the restored windows. Then, since new apps aren't installed and boot knows only installed ones, it awaits `apps.catalogue()` when one isn't known and narrows `announced` to the apps the catalogue has (a fork without them shows none). It imports `components/announcement/app-announcement.svelte`, takes each announced app from `apps.listings()`, so it arrives with its description and authors; then calls `dialogs.show(AppAnnouncement, { apps })` once, dismissible (Esc, outside click, the phone's Back). Nothing is persisted: it shows once because the seen marker moves at boot. The component loads every paged app's `preview` and `highlights` in one await and renders the card only then, so it opens at full size instead of growing (separate `{#await}` blocks rendered empty for a frame). The "Updated to vX" toast still shows. First boot shows the introduction and no announcement.

Usage stats ask (ADR-070): private `after_restore(run)` is the effect above, shared by the announcement and the ask. On first boot it starts once the introduction closes; on any other boot (full mode only: `SoloVersionService.init()` is empty) it starts in `init()`. When `settings.analytics` is still `unasked`, it posts a sticky `settings` notification "Share which apps you open?" with Allow (`allowed`) and No thanks (`declined`). Closing it without an answer leaves `unasked`, so the next boot asks again. Nothing of its own is persisted; the answer lives in SettingsService.

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
| Apps | "What are you into?" (ADR-040). A first boot has only the four core apps (`CORE_APPS`: App Store, Settings, Files, Terminal); five interest toggles (secondary buttons, primary tint when picked; `INTERESTS` in `services/apps/suggestions.ts`: Create, Get things done, Play, Build, Meet the maker (Portfolio); one with none of its apps registered is hidden) list their apps as cards (icon, name, first highlight or the description) with a Pin toggle ("Add" on mobile). Skip and Start both install the picked groups (`apps.install`) and pin the toggled apps among them (`desktop.pin`). Replaying it only adds |
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

- **The SW** precaches the core only (ADR-065, ADR-077): `workbox.manifestTransforms` keeps only the files `tooling/vite-plugin-offline.ts` lists in `offline/core.json`, plus everything outside `assets/` (`index.html`, `includeAssets`, the manifest icons). WebOS boots offline. Every app, system apps included, loads on demand: the last `runtimeCaching` rule caches every other `/webos/assets/` file `CacheFirst` into `webos-assets`, one cache for every release, and [StoreService](store.md) fills it with the installed apps and prunes what none lists. Before 3.58.0 every app was precached (844 entries, 12.4 MB); now 305 (4.2 MB), and that number doesn't grow with the app count. The codec `.wasm` (AVIF, JPEG XL; 2–3.5 MB each) and Shopping List's text reader (ONNX Runtime's 14 MB wasm and the 4.8 MB and 8 MB `.onnx` models) are left out of the precache so an install doesn't download them. A `CacheFirst` runtime rule (`runtimeCaching`, `.wasm` and `.onnx`) keeps each one in the `webos-wasm` cache the first time an app loads it, so those formats and reading a list from a photo then work offline. `maxEntries: 16` bounds it: the file names are content-hashed, so a release with new wasm adds entries and the oldest fall out. Three more `CacheFirst` rules work the same way, 200 responses only: `webos-fonts` for the built-in app fonts (`*.ttf|ttc`) and `webos-dictionaries` for Warren's spelling dictionary (`*.aff`, `*.dic`), each at most 8 entries, and `webos-mammoth` for Warren's `.docx` import (`assets/mammoth-*.js`, about 99 KB gz, 2 entries). CacheFirst never asks the network again, so every file these rules cover has a content-hashed name: Burrow moved from `public/fonts/` to `src/assets/fonts/burrow/` and loads through `?url` imports (2026-10-22), so a fixed font is a new URL and reaches installs that cached the old one. The mammoth chunk gets a fixed name prefix from `build.rollupOptions.output.chunkFileNames` (any chunk holding a module from `node_modules/mammoth/`), and `workbox.globIgnores` leaves it out of the precache; offline, a `.docx` import works once it has been used online. With `autoUpdate` the new worker skips waiting and claims open clients as soon as it installs. The browser also checks for a new `sw.js` on its own (on navigation, at most daily otherwise).
- **Notification clicks.** The generated worker also pulls in `public/sw-notifications.js` through `workbox.importScripts` (`vite.config.ts`), which routes OS notification clicks to a WebOS tab or opens one ([scheduler › Notification clicks](scheduler.md#notification-clicks), ADR-062). It adds a `notificationclick` handler only: the precache manifest in `sw.js` keeps its shape, so `precache.ts` still parses it.
- **VersionService** decides *when the user is told*. `version.json` isn't precached and is fetched with `no-store`, so `check()` always sees the deployed build. Offline, the check is skipped (`navigator.onLine`) or its failed fetch ignored, so an offline boot logs nothing.
- **`apply_update()`** bridges them. A plain reload would boot the old build from the precache. So it calls `registration.update()` to fetch the new `sw.js`, waits for that worker to activate (it skips waiting and claims this page), and only then reloads. The reload is served from the new precache, and offline keeps working afterwards.
- **Fallback (2026-10-12).** GitHub Pages' CDN can keep serving the old `sw.js` for minutes after `version.json` changed. Then `update()` finds nothing, and the old flow reloaded into the same build, so "Update and reload" looked like it did nothing. Now that case unregisters this app's worker, deletes its scoped caches and reloads with a cache-busting query, so the next boot comes from the network and registers the new worker. Modelled on series-tracker's `applyUpdate`, minus its origin-wide wipe.

**The browser got there first (2026-10-22).** The browser's own update check can install and activate the new worker before the click; it claims this page, so `installing` and `waiting` are both `null` after `update()`. `init()` keeps `navigator.serviceWorker.controller` as `boot_worker`; when `registration.active` is a different worker (`installed_already`), the new precache is already there, so it waits for that worker to be `activated` and reloads like the happy path. Same-worker or unknown (the page booted without a controller: first visit, hard reload) still takes the fallback path: unregister, clear this app's caches, reload from the network.

### Update progress

Since ADR-065 the install holds only the core (and since ADR-077 no app at all, system apps included), so the overlay waits for those files alone and counts only them; the installed apps follow after the reload as a background task, with a progress ring on each app's icon ([store](store.md#sync)). Measured with a preview build: a rebuild with one changed user app installed 9 precache files and reloaded into the new build in about 2 s; the installed app was saved again 0.3 s later and the old build's cache deleted.

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

`UpdateOverlay` (`components/update/update-overlay.svelte`, in `os.svelte`, so both shells) is one card in two panes. The status pane shows the logo, "Updating WebOS" and from → to (`v3.74.0 → v3.75.0`), then the three-step list. Under the active "Downloading the new version" step it shows a `role="progressbar"` (`bg-primary` on `bg-foreground/12`, the same inline bar as Getting started and toasts) once `total` is known, and a mono line `progress_line()`: "212 of 606 files · 14 s", or only "14 s" while the total is unknown or zero. Elapsed seconds tick from a local 1 s interval. With `slow`, a short text and **Restart now** sit at the pane's foot. The **What's new** pane lists every `update_available.notes` release newer than the running one in full: title, version badge, each change with its kind badge (`change_kind()` in `components/update/change-kind.ts`, shared with Settings › What's new and the App Store's history; an unknown kind from a newer build shows its raw name), scrolling under a sticky heading. The overlay is a size container: from `@2xl` the panes sit side by side (`18rem` status, notes beside, card capped at `36rem` tall); narrower, status stacks over the notes (at least `12rem` tall) and the notes scroll. The card itself scrolls when a short screen can't fit it, and side by side the status pane scrolls on its own, so Restart now stays reachable. No notes (an older `version.json`), no notes pane, and the card narrows to `max-w-sm`.

## Divergence from ADR

- ADR-004's PWA revision promised every app offline. ADR-065 replaced it: the core and system apps are precached, user apps only when picked or opened. ADR-077 then took system apps out of the precache and made installed apps the ones kept ([store](store.md)).

- ADR-004 originally rejected a service worker; its revision note accepts the SW and the cooperation above.
- ADR-004 calls for a `CHANGELOG.md` fetched at runtime. ADR-026 replaced it with the bundled, typed `changelog.ts` (ADR-004 revision note). Since 2026-10-27 it is fetched at runtime again, as `store/changelog.json` the build writes from `changelog.ts`, and the running version comes from the catalogue instead of a compile-time constant (ADR-004 and ADR-077 revision notes).
- ADR-038 limits `announced` to installed apps. The code keeps every introduced app that is still registered, installed or not, so Open opens it, without installing since ADR-077 (ADR-040). Revision note 2026-10-18; the `announced` JSDoc in `type.ts` still says "Installed apps".

## Shell

Contributes `version`, `changelog`, `install`, `ci status` and the `release`, `new-app` and `ci-job` value types (`version/shell.ts`). `changelog --changes` (`-c`) yields one untagged row per change (version, kind, text). `changelog --apps` yields one `new-app` row per introduced app that is still registered (id, name, added, date), newest release first; clicking a row launches the app. `new-app` is its own type because `app`'s columns (id, name, category) would hide when it came; the command's `yields` stays `release`, so `where` after `--apps` completes release columns. `install` is `available()` only while not installed; it yields the platform hint when no prompt is held, otherwise "Installing…" then "Installed." or "Install dismissed.". `ci status` yields one `ci-job` row per job of the newest master run (job, status, took: `format_took` of started to completed, `-` while unfinished); clicking a row opens the job on GitHub in a new tab. See [shell](shell.md#contributions).

## Known gaps

- With two tabs open, the first to boot writes the seen marker; the other shows no toast.
- A browser tab of an already installed WebOS gets no prompt event and isn't standalone, so it shows the hint instead of "Installed".

- `update_available` is never cleared, even if a later check finds nothing newer.
- The SW can activate a new build in the background (the browser's own update check) while a tab still runs the old one. Nothing tells VersionService. The banner still appears on the next `check()`, and the tab keeps running old code until reloaded; "Update and reload" then just reloads (above).
- Progress counts files, not bytes; a few large chunks can make the bar move unevenly.
- The manifest is read with a regex over `generateSW`'s minified output. A Workbox upgrade that writes it differently leaves only the elapsed time (no error).
- Offline on a release's first boot (the browser installed the new service worker in the background, and the old core's slice is all there is), `info` is `null` and What's new reads the last cached `store/changelog.json` or nothing.
