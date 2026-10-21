# ADR-004: Version & Update Detection System
**Date:** 2026-01-27
**Status:** Implemented

> **Revision 2026-10-21: update progress ([brainstorm](../brainstorm/2026-10-21_slow-updates.md))**
> - A release renames most of the precache and Workbox installs it one file at a time, so "Update and reload" could sit on a silent spinner, then the old 8 s timeout threw the half-done install away and cleared everything.
> - The update screen now shows files done of the total and elapsed seconds. Progress is read from Cache Storage (the new `sw.js` manifest against the precache cache's keys), so the service worker is unchanged. Bytes aren't shown: the manifest Workbox writes has no sizes.
> - `registration.update()` has a 15 s timeout. After 8 s the screen says "Still downloading…" and offers Restart now (the clear-and-reload path). The wait gives up on its own after 20 s without a new file, or 120 s in all.
> - `IVersionService` gains `update_progress` and `restart_update()`. Details in [version.md](../system/services/version.md#update-progress).

> **Revision 2026-10-11: release notes ([ADR-026](026-release-notes-intro.md))**
> - The changelog is a bundled, typed `changelog.ts`, not a `CHANGELOG.md` fetched at runtime. A runtime markdown file would need a renderer dependency, and there are no kinds for badges.
> - The "update available" toast is built: it's sticky, shown once per detected build, and offers "Update and reload".
> - Releases are `package.json` semver bumps. History is backfilled as 0.1.0 to 0.7.0.

> **Revision 2026-10-11: the service worker stays**
> - A standalone, installable PWA is a main goal of the project, so the VitePWA service worker that ADR-004 rejected under "Alternatives" stays. It was already registered in production (`registerType: "autoUpdate"`: Workbox precache, navigation fallback to `index.html`, `skipWaiting` + `clientsClaim`).
> - Roles: the service worker owns caching and offline use. VersionService only detects a new build through `version.json`, which isn't precached, so it always hits the network.
> - `apply_update()` no longer clears caches or unregisters the worker, which used to throw away offline support until the next load. It calls `registration.update()`, waits for the new worker to activate, then reloads into the new precache.
> - The bundle and `version.json` now share one build stamp. Before this fix, every production check reported an update.
> - Manifest `background_color` is Brand Dark, so a standalone launch doesn't flash white.

## Context
The app is a SPA hosted on GitHub Pages (static-only, no server-side control). Users need to know when a new version is deployed and be able to update. The previous React implementation used `version.json` polling, which worked well for these constraints.

## Decision
Use a build-generated `version.json` file with polling-based update detection.

### Version Bumping
- Manual version bump in `package.json` before deploying.

### Build Time
- Vite plugin generates `version.json` at build time containing: version, commit hash, branch, and build timestamp.
- `CHANGELOG.md` is maintained manually in the repo root as a separate file.

### Runtime Detection
- Poll `/version.json` on a long interval (~30 minutes).
- Additionally check on `document.visibilitychange` (user returning to stale tab) with throttling.
- Use `cache: "no-store"` on the fetch to bypass caching.
- Compare `buildTimestamp` to detect updates.

### User Experience
- Toast notification when update is available.
- Settings app displays current version info, manual "Check for Updates" button, and fetches/renders `CHANGELOG.md` as markdown.
- "Update" action clears caches and hard-reloads.

### `version.json` Structure
```json
{
  "version": "1.2.0",
  "commit": "abc1234",
  "branch": "master",
  "buildTime": "2026-01-27T12:00:00Z",
  "buildTimestamp": 1737975600000
}
```

### Changelog
- Separate `CHANGELOG.md` in repo root, fetched and rendered at runtime when user views it.
- Not embedded in `version.json` — avoids build-time parsing and duplication.

## Alternatives Considered
- **Build hash in `index.html` meta tag** — Fetching and parsing own HTML felt hacky; GitHub Pages CDN caching reduces reliability.
- **Service Worker** — Overkill complexity for just update detection; no PWA/offline needs currently. *(Superseded 2026-10-11: the PWA goal brought it back, see the revision note.)*
- **GitHub Deployments API** — No auth needed for public repos, but adds external dependency and 60 req/hour rate limit. Unnecessary when `version.json` works.
- **Server-Sent Events** — Requires backend; not possible on GitHub Pages.

## Consequences
- A Vite plugin or build script must run on every build to generate `version.json`.
- `CHANGELOG.md` must be manually maintained (small overhead, better quality).
- Version must be manually bumped in `package.json` before deploying.
- Detection has a delay (up to polling interval), mitigated by `visibilitychange` check.
- No external dependencies or authentication required.
