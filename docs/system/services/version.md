# VersionService

Key `version` · Depends on: none · ADR: [ADR-004](../../adrs/004-version-update-system.md) · Source: `src/lib/core/api/services/version/`, `vite-plugin-version.ts`

## Purpose

Knows which build is running and detects when a newer build has been deployed, by polling `/version.json`. It can also apply the update: install the new service worker, then reload into the new build.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `info` | `info: VersionInfo` | The running build. Initialized from the compile-time constant `__VERSION_INFO__`. `$state`, but never reassigned. |
| `update_available` | `update_available: VersionInfo \| null` | The remote info, set when `remote.buildTimestamp > info.buildTimestamp`. Never reset to `null`. |
| `is_checking` | `is_checking: boolean` | True while a `check()` is in flight. |
| `check` | `check(): Promise<void>` | Re-entrancy guarded: returns at once if a check is already running. Fetches `/version.json` with `cache: "no-store"`. A non-OK response is ignored silently. Network or parse errors go to `console.error`. Never throws. |
| `apply_update` | `apply_update(): Promise<void>` | If a service worker is registered: `registration.update()`, then waits for the installing or waiting worker to reach `activated`. Then `location.reload()`. Errors (including a worker that goes `redundant`) go to `console.error`, and in that case there's no reload. See [Service worker](#service-worker). |
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

`buildTime` and `buildTimestamp` are camelCase on purpose. They're the deployed wire format ([CONVENTIONS → Naming](../../CONVENTIONS.md#naming)).

## Where the data comes from

`vite-plugin-version.ts` → `version_plugin()`, registered in `vite.config.ts`:

| Hook | Effect |
|------|--------|
| `config()` | Calls `get_version_info()` **once** and keeps the result. Defines `__VERSION_INFO__` as that JSON, so it's baked into the bundle in dev and in build. |
| `configResolved()` | Records `build.outDir` (resolved against root). |
| `closeBundle()` (build) | Writes the same stamp to `{outDir}/version.json`. |
| `configureServer()` (dev) | Middleware answers `/version.json` with the same stamp, `Cache-Control: no-store`. |

The bundle and `version.json` always carry the same `buildTimestamp`. Only a new build (or a dev server restart) produces a newer one.

`get_version_info()` reads `package.json`, runs `git rev-parse --short HEAD` and `--abbrev-ref HEAD` (falling back to `"unknown"`), and stamps `new Date()`.

## State

Three `$state` fields (`info`, `update_available`, `is_checking`) and two private fields (`last_check` ms, `poll_interval` id). Nothing derived.

## Lifecycle

`init()`:

- `setInterval(check, 30 min)`
- `document.addEventListener("visibilitychange", …)`: when the tab becomes visible and more than 60 s have passed since `last_check`, it runs `check()`.

`destroy()` clears the interval and removes the listener.

No check runs at boot. The first check happens on the first tab-visible event (`last_check` starts at `0`), on the 30-minute tick, or when the Settings app button is clicked.

## Consumers

Only the Settings app's About section (`settings.app.svelte`). It shows `info`, plus a "Check for Updates" button and an "Update Available → Refresh to Update" panel, which is hidden when `import.meta.env.DEV` is set. Nothing else reads `update_available`. There's no toast.

## Persistence

None of its own. The SW precache in Cache Storage belongs to Workbox ([persistence.md](../persistence.md)); `apply_update()` swaps it for the new build's, it never deletes it.

## Behaviour & invariants

- The comparison is strictly on `buildTimestamp`. Version string and commit are display-only.
- In dev, an update shows up only after the dev server restarts (vite also restarts it when config changes) while an old tab is still open. The UI hides the panel behind `!import.meta.env.DEV` anyway.
- `fetch("/version.json")` is root-absolute. It works because Vite `base` is the default `/`. Deploying under a sub-path would break it.

## Service worker

Production builds register a Workbox SW through `VitePWA({ registerType: "autoUpdate" })` in `vite.config.ts` (`sw.js`, `workbox-*.js`, plus `registerSW.js` injected into `index.html`). The PWA is a goal in its own right: installable, standalone, offline. The manifest's `theme_color` and `background_color` are both Brand Dark `#17252C`, so a standalone launch doesn't flash white. Dev registers no SW.

Who does what:

- **The SW** precaches the app shell (`js`, `css`, `html`, plus `includeAssets` and the manifest icons) and serves it, so the app boots offline. With `autoUpdate` the new worker skips waiting and claims open clients as soon as it installs. The browser also checks for a new `sw.js` on its own (on navigation, at most daily otherwise).
- **VersionService** decides *when the user is told*. `/version.json` isn't precached and is fetched with `no-store`, so `check()` always sees the deployed build. Offline, the fetch fails and logs.
- **`apply_update()`** bridges them. A plain reload would boot the old build from the precache. So it calls `registration.update()` to fetch the new `sw.js`, waits for that worker to activate (it skips waiting and claims this page), and only then reloads. The reload is served from the new precache, and offline keeps working afterwards.

If the browser already installed the new worker before the click, `installing` and `waiting` are both `null` and it reloads straight away, which is correct: the active worker already serves the new build.

## Divergence from ADR

- ADR-004 originally rejected a service worker; its revision note accepts the SW and the cooperation above.
- ADR-004 calls for a toast when an update is found. There's none: VersionService doesn't depend on `notifications`, and nothing watches `update_available`.
- ADR-004 calls for a `CHANGELOG.md` fetched and rendered in Settings. It doesn't exist (also noted in ROADMAP "Release notifications").

## Known gaps

- `update_available` is never cleared, even if a later check finds nothing newer.
- The SW can activate a new build in the background (the browser's own update check) while a tab still runs the old one. Nothing tells VersionService. The banner still appears on the next `check()`, and the tab keeps running old code until reloaded.
- `activated()` has no timeout. A worker stuck in `installing` (slow network on a big precache) leaves the button with no feedback until it finishes.
