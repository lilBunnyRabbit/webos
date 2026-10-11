# VersionService

Key `version` · Depends on: `files`, `notifications`, `dialogs`, `apps` · ADR: [ADR-004](../../adrs/004-version-update-system.md), [ADR-026](../../adrs/026-release-notes-intro.md) · Source: `src/lib/core/api/services/version/`, `src/lib/core/components/intro/`, `vite-plugin-version.ts` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Knows which build is running and detects when a newer build has been deployed, by polling `{BASE_URL}version.json`. It can also apply the update: install the new service worker, then reload into the new build. It owns the release notes (`changelog.ts`), remembers which release this device last saw, and shows the full-screen introduction on first boot (ADR-026).

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `info` | `info: VersionInfo` | The running build. Initialized from the compile-time constant `__VERSION_INFO__`. `$state`, but never reassigned. |
| `update_available` | `update_available: VersionInfo \| null` | The remote info, set when `remote.buildTimestamp > info.buildTimestamp`. Never reset to `null`. |
| `is_checking` | `is_checking: boolean` | True while a `check()` is in flight. |
| `check` | `check(): Promise<void>` | Re-entrancy guarded: returns at once if a check is already running. Fetches `${import.meta.env.BASE_URL}version.json` (`/webos/version.json` in production) with `cache: "no-store"`. A non-OK response is ignored silently. Network or parse errors go to `console.error`. Never throws. |
| `apply_update` | `apply_update(): Promise<void>` | If a service worker is registered: `registration.update()`, then waits for the installing or waiting worker to reach `activated`. Then `location.reload()`. Errors (including a worker that goes `redundant`) go to `console.error`, and in that case there's no reload. See [Service worker](#service-worker). |
| `changelog` | `readonly Release[]` | `CHANGELOG` from `changelog.ts`, newest first |
| `unseen` | `Release[]` | `$state`. Releases newer than the seen marker read at boot and not newer than `info.version`. Set once in `init()`, kept for the session |
| `show_intro` | `show_intro(): Promise<void>` | `dialogs.show(IntroDialog, {}, { dismissible: false })`. Resolves when it closes. Doesn't write the seen marker |
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
interface Change { kind: ChangeKind; text: string }
interface Release { version: string; date: string /* YYYY-MM-DD */; title: string; changes: Change[] }
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

Four `$state` fields (`info`, `update_available`, `is_checking`, `unseen`) and private `last_check` (ms), `notified_build` (the `buildTimestamp` last toasted), `poll_interval`, `destroyed`. Nothing derived.

## Lifecycle

`init()`:

- `setInterval(check, 30 min)`
- `document.addEventListener("visibilitychange", …)`: when the tab becomes visible and more than 60 s have passed since `last_check`, it runs `check()`.

- Reads `/var/lib/version/state.json` and branches, see [Release notes and introduction](#release-notes-and-introduction). The introduction is requested without awaiting, like Restore.

`destroy()` clears the interval, removes the listener, and stops a pending introduction from writing the marker.

No check runs at boot. The first check happens on the first tab-visible event (`last_check` starts at `0`), on the 30-minute tick, or when the Settings app button is clicked.

## Consumers

- Settings › About: `info`, "Check now" / "Update and reload", "Show again" (`show_intro()`). Update checks are disabled in dev.
- Settings › What's new: `changelog`, `unseen`, `info.version`.
- Its own toasts (below).

## Release notes and introduction

A release is a `package.json` version bump plus an entry at the top of `changelog.ts` (ADR-026). The rule for agents is in CLAUDE.md. Versions compare numerically per `major.minor.patch` (`semver.ts`).

At boot (`init()`), after reading the seen marker:

| Marker | What happens |
|--------|--------------|
| missing or invalid | `show_intro()`. When it closes, `seen = info.version` is written |
| `seen >= info.version` | Nothing |
| `seen < info.version` | `unseen` = releases in `(seen, info.version]`. `seen = info.version` is written at once. If `unseen` isn't empty: sticky toast "Updated to v{version}", message "3 new · 1 improved · 2 fixed" (only kinds present), action "What's new" → `apps.launch("settings", { section: "whats-new" })` |

When `check()` finds a newer build: one sticky toast per build (`notified_build`), "A new version is ready", "v{x}. WebOS reloads and offers your open windows back.", action "Update and reload" → `apply_update()`. Skipped in dev. The release notes stay hidden until after the reload, since the old bundle can't know them.

Both toasts use app id `version`, so they're in the notification history.

### `IntroDialog`

`components/intro/intro-dialog.svelte`, a full-viewport takeover (`fixed inset-0`, `background-darkest` with a `background-dark` glow at the top), shown as a non-dismissible system dialog ([dialogs](dialogs.md#third-consumer-introdialog)). Esc does nothing; Skip (top right, on every page but the last) resolves.

| Page | Content |
|------|---------|
| Hello | Logo mark, "Welcome to WebOS", one-line pitch. Button "Get started" |
| Your files | Four cards: stored on this device, works offline, Save to disk, clearing site data deletes them (`warning` tile) |
| Getting around | Start menu, windows (drag, snap, double-click), right-click menus, the desktop folder. Keyboard line with `Kbd`s |
| Make it yours | `ThemeCard` grid of `THEME_PRESETS` and a taskbar `Segmented`, both writing `settings` live |
| Ready | Updates, windows come back, work in progress, replay from About. Button "Start using WebOS" |

Paging: Back/Next, dot buttons, and ←/→ on `window` (ignored inside inputs and radio groups). Each page enters with `animate-pop-in`, keyed on the page. The primary button carries `autofocus`. Cards switch to two columns at `@xl` of the content column. Display sizes `text-2xl`/`text-3xl` are used only here.

## Persistence

`/var/lib/version/state.json`: `{ "version": 1, "seen": "0.8.0" }` (`persistence.ts`, zod, written through `LatestWriter`). The Workbox precache in Cache Storage belongs to the service worker ([persistence.md](../persistence.md)); `apply_update()` swaps it, never deletes it.

## Behaviour & invariants

- The comparison is strictly on `buildTimestamp`. Version string and commit are display-only.
- In dev, an update shows up only after the dev server restarts (vite also restarts it when config changes) while an old tab is still open. The UI hides the panel behind `!import.meta.env.DEV` anyway.
- The URL is built from `import.meta.env.BASE_URL`, so it follows Vite `base` (`/webos/`, the GitHub Pages project path).

## Service worker

Production builds register a Workbox SW through `VitePWA({ registerType: "autoUpdate" })` in `vite.config.ts` (`sw.js`, `workbox-*.js`, plus `registerSW.js` injected into `index.html`). The PWA is a goal in its own right: installable, standalone, offline. The manifest's `theme_color` and `background_color` are both Brand Dark `#17252C`, so a standalone launch doesn't flash white. Dev registers no SW.

Who does what:

- **The SW** precaches the app shell (`js`, `css`, `html`, plus `includeAssets` and the manifest icons) and serves it, so the app boots offline. With `autoUpdate` the new worker skips waiting and claims open clients as soon as it installs. The browser also checks for a new `sw.js` on its own (on navigation, at most daily otherwise).
- **VersionService** decides *when the user is told*. `version.json` isn't precached and is fetched with `no-store`, so `check()` always sees the deployed build. Offline, the fetch fails and logs.
- **`apply_update()`** bridges them. A plain reload would boot the old build from the precache. So it calls `registration.update()` to fetch the new `sw.js`, waits for that worker to activate (it skips waiting and claims this page), and only then reloads. The reload is served from the new precache, and offline keeps working afterwards.

If the browser already installed the new worker before the click, `installing` and `waiting` are both `null` and it reloads straight away, which is correct: the active worker already serves the new build.

## Divergence from ADR

- ADR-004 originally rejected a service worker; its revision note accepts the SW and the cooperation above.
- ADR-004 calls for a `CHANGELOG.md` fetched at runtime. ADR-026 replaced it with the bundled, typed `changelog.ts` (ADR-004 revision note).

## Known gaps

- With two tabs open, the first to boot writes the seen marker; the other shows no toast.

- `update_available` is never cleared, even if a later check finds nothing newer.
- The SW can activate a new build in the background (the browser's own update check) while a tab still runs the old one. Nothing tells VersionService. The banner still appears on the next `check()`, and the tab keeps running old code until reloaded.
- `activated()` has no timeout. A worker stuck in `installing` (slow network on a big precache) leaves the button with no feedback until it finishes.
