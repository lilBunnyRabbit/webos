# Slow update screen
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
Owner: "sometimes update screen takes ages. what is the cause. if we cant fix it we need to display more info what is going on and status of it."

Investigation:
- **Offline cache size.** The precache holds 765 entries, 10.3 MB (`vite.config.ts` VitePWA `globPatterns: **/*.{js,mjs,css,html,woff2}`).
- **Hash cascade.**
  - A one-line change in one app (Snake), or only a version bump, renames 606 of the 765 files (5.4 MB).
  - Rollup's file hash includes the names of the files a chunk imports.
  - The entry chunk `index-*.js` holds the app registry, which contains every app chunk's filename. Most app chunks import the kernel, kit and Svelte from the entry chunk, so any change renames the entry and then nearly everything.
- **Update flow** (`version/service.svelte.ts` `apply_update`):
  - `registration.update()` has no timeout.
  - The flow then waits up to `ACTIVATE_TIMEOUT` = 8 s for the new worker. Its install downloads every renamed file, and nothing shows progress.
  - On timeout it unregisters, clears the caches and reloads from the network. The new worker then precaches all 10 MB in the background, competing with boot and session restore.

## Decisions
- **A, build fix (decided).**
  - Split the shared core (kernel, kit, Svelte runtime and the rest of the static boot graph) into its own chunk that does not contain the app registry's filenames. The entry keeps the registry.
  - App chunks import from the core chunk, so an app change renames only that app plus the entry and registry.
  - Volatile build values (version, build stamp, changelog) must stay out of the core chunk.
  - Measure renamed-file count and MB before and after, for an app-only change and a version-only change. Re-check the boot budget (ADR-036).
- **B, progress (decided).**
  - The update overlay shows real progress: files and MB done out of the total for the new worker's install, plus elapsed time.
  - `registration.update()` gets a timeout.
  - When the wait runs long, show "Still downloading…" with a "Restart now" button instead of silently clearing and reloading.
- **Rejected:**
  - C, precache only the shell and cache apps on first open: breaks the 2026-10-15 offline promise.
  - B alone: updates stay 5 MB.

## Action items
- A in one build agent; B in another (different files). Both bump the changelog, so the merger renumbers.
  - [x] B built: files done of the total and elapsed seconds, read from Cache Storage with the service worker unchanged. No MB: the precache manifest has no sizes. Restart now after 8 s; automatic fallback after 20 s without a new file or 120 s in all; `update()` times out at 15 s.
- docs/system: version page (B), and boot weight / build notes (A). ADR-036 and ADR-004 revision notes.
  - [x] B: version page (Update progress) and the ADR-004 revision note.

## Next session topics
- If A can't break the cascade cleanly, look at import maps or unhashed filenames with content revisions.
