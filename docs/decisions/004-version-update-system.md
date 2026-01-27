# ADR-004: Version & Update Detection System
**Date:** 2026-01-27
**Status:** Implemented

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
- **Service Worker** — Overkill complexity for just update detection; no PWA/offline needs currently.
- **GitHub Deployments API** — No auth needed for public repos, but adds external dependency and 60 req/hour rate limit. Unnecessary when `version.json` works.
- **Server-Sent Events** — Requires backend; not possible on GitHub Pages.

## Consequences
- A Vite plugin or build script must run on every build to generate `version.json`.
- `CHANGELOG.md` must be manually maintained (small overhead, better quality).
- Version must be manually bumped in `package.json` before deploying.
- Detection has a delay (up to polling interval), mitigated by `visibilitychange` check.
- No external dependencies or authentication required.
