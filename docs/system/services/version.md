# VersionService

Key `version` · Depends on: none · ADR: [ADR-004](../../adrs/004-version-update-system.md) · Source: `src/lib/core/api/services/version/`, `vite-plugin-version.ts`

## Purpose

Knows which build is running and detects when a newer build has been deployed, by polling `/version.json`. It can also force-update: clear caches, unregister service workers and reload.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `info` | `info: VersionInfo` | The running build. Initialized from the compile-time constant `__VERSION_INFO__`. `$state`, but never reassigned. |
| `update_available` | `update_available: VersionInfo \| null` | The remote info, set when `remote.buildTimestamp > info.buildTimestamp`. Never reset to `null`. |
| `is_checking` | `is_checking: boolean` | True while a `check()` is in flight. |
| `check` | `check(): Promise<void>` | Re-entrancy guarded: returns at once if a check is already running. Fetches `/version.json` with `cache: "no-store"`. A non-OK response is ignored silently. Network or parse errors go to `console.error`. Never throws. |
| `apply_update` | `apply_update(): Promise<void>` | Deletes every Cache Storage entry, unregisters every service worker, then calls `location.reload()`. Errors go to `console.error`, and in that case there's no reload. |
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
| `config()` | Calls `get_version_info(root)` and defines `__VERSION_INFO__` as that JSON. It's baked into the bundle, in dev and in build. |
| `closeBundle()` (build) | Calls `get_version_info(root)` **again** and writes `dist/version.json`. The path is hardcoded to `<root>/dist` and ignores `build.outDir`. |
| `configureServer()` (dev) | Middleware answers `/version.json` with a freshly computed `get_version_info()` on every request, `Cache-Control: no-store`. |

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

None of its own. `apply_update()` wipes Cache Storage and service worker registrations ([persistence.md](../persistence.md)).

## Behaviour & invariants

- The comparison is strictly on `buildTimestamp`. Version string and commit are display-only.
- **The build always reports an update.** `__VERSION_INFO__` is stamped in `config()`, at the start of the build. `version.json` is stamped in `closeBundle()`, at the end. So the deployed `version.json.buildTimestamp` is always later than the bundled one, and the first `check()` on a fresh deploy sets `update_available`. Confirmed in the current `dist/`: `version.json` has `1791671679864` and the bundle has `1791668030165`. Applying the "update" reloads into the same build, which reports an update again.
- In dev, the middleware stamps `new Date()` per request, so every check reports an update too. The UI hides this behind `!import.meta.env.DEV`.
- `fetch("/version.json")` is root-absolute. It works because Vite `base` is the default `/`. Deploying under a sub-path would break it.

## Divergence from ADR

- ADR-004 calls for a toast when an update is found. There's none: VersionService doesn't depend on `notifications`, and nothing watches `update_available`.
- ADR-004 calls for a `CHANGELOG.md` fetched and rendered in Settings. It doesn't exist (also noted in ROADMAP "Release notifications").
- ADR-004 rejected a service worker. `vite.config.ts` includes `VitePWA({ registerType: "autoUpdate" })`, so production builds register a Workbox SW (`sw.js`, `registerSW.js`) that precaches the app shell. The SW updates itself on its own schedule, separately from VersionService. `apply_update()` unregisters it before reloading, so it re-registers on the next load.

## Known gaps

- The timestamp bug above makes update detection useless in production: it always fires. Stamp once and reuse it in both hooks (for example, cache the result of the first `get_version_info()` call).
- `update_available` is never cleared, even if a later check finds nothing newer.
- `closeBundle` writes to a hardcoded `dist/`.
