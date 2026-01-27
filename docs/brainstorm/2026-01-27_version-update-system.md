# Version & Update Detection System

**Date:** 2026-01-27
**Context:** Migrating version/update system from React `_old/` to Svelte 5. Want to improve on the previous polling-based approach.

## Previous Implementation (React)

- Build script generates `version.json` (version, commit, branch, buildTime, buildTimestamp)
- App imports version at build time as `APP_VERSION`
- TanStack Query polls `/version.json` every 5 minutes
- Compares `buildTimestamp` to detect updates
- Toast notification with "Refresh Now" / "Later"
- `hardRefresh()` clears service workers + caches + reloads

### Limitations
- Polling wastes requests when nothing changed
- 5-minute window where user runs stale code
- No changelog or migration info
- Service worker cleanup is reactive, not proactive

## Approaches Considered

### 1. Polling (Current) - Simple but wasteful
Keep `/version.json` polling. Simple, works everywhere. Wastes bandwidth, has delay.

### 2. Service Worker - Browser-native update flow
Register a service worker that precaches assets. On new deploy, SW detects changed files via byte comparison. Use `updatefound` + `statechange` events to notify user. No polling needed - SW update check happens on navigation and periodically by the browser (~24h max).

**Pros:** No polling, browser handles cache invalidation, offline support
**Cons:** Complexity, SW lifecycle is tricky, overkill if not doing PWA

### 3. Hybrid: ETag/If-None-Match + Polling
Poll `/version.json` but use HTTP `ETag` or `Last-Modified` headers. Server returns `304 Not Modified` when unchanged - almost zero bandwidth. Still need polling interval.

### 4. Server-Sent Events (SSE)
Server pushes version change notification. Zero delay, zero wasted requests. Requires server-side support (even a tiny endpoint).

### 5. Build-time Hash in HTML
Vite injects build hash into `index.html` meta tag. On each SPA "navigation", fetch `index.html` with `cache: "no-cache"`, extract meta tag, compare. No extra file needed.

## Discussion

- Explored GitHub Deployments API (no auth needed for public repos) but rate limit (60/hr) and external dependency made it unnecessary.
- All server-dependent approaches (SSE, custom headers) ruled out by GitHub Pages constraint.
- Service Worker and HTML meta tag approaches deemed overkill for the need.
- Polling `version.json` is the right fit — simple, no dependencies, fully static.
- Extend with changelog (manually maintained) and `visibilitychange` check for returning tabs.

## Key Takeaways

- Keep it simple. `version.json` polling works well for static hosting.
- Add changelog to `version.json` for user-facing "What's new" display.
- Use `visibilitychange` + throttled polling instead of short fixed intervals.

## Decision

Recorded as **ADR-004**: `/docs/decisions/004-version-update-system.md`
