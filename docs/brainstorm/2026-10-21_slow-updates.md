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
  - [x] A built (3.21.0): `core` chunk (boot graph minus anything reaching app code, the registry, the build stamp or the changelog; `vite-core-chunk.ts`) and `app-boot` chunk (manifest icons, props, sections); the stamp read only in `version/build-info.ts`; `main.ts` calls `register_default_services()` before `kernel.init()`; phosphor imports rewritten per icon at build time. Renamed precache files: rebuild 606 → 16 (5.65 → 0.32 MB), one-line app change 606 → 17 (0.33 MB), version bump + changelog edit 606 → 17 (0.39 MB). Boot 171.8 (3.19.0) → 170.5 KB gz (3.21.0) (now counting preloaded chunks). Left: 12 apps import their own `index.ts` and rename every time; any OS change still renames every app.
  - [x] B built: files done of the total and elapsed seconds, read from Cache Storage with the service worker unchanged. No MB: the precache manifest has no sizes. Restart now after 8 s; automatic fallback after 20 s without a new file or 120 s in all; `update()` times out at 15 s.
- docs/system: version page (B), and boot weight / build notes (A). ADR-036 and ADR-004 revision notes.
  - [x] B: version page (Update progress) and the ADR-004 revision note.
  - [x] A: overview Build & deploy (Chunks, budget), kernel, version and backup pages; ADR-036 revision note.

- Owner, 2026-10-21: the update screen stays at files only, with no MB (the workbox manifest drops sizes; a `manifestTransforms` entry could keep them, but it was declined).
- Owner call pending: the 12 app chunks that still rename on every build because they import their own `index.ts`.

## Next session topics
- If A can't break the cascade cleanly, look at import maps or unhashed filenames with content revisions.

## Follow-up 2026-10-21: core changes still rename ~575 files

Owner, updating 3.23.0 → 3.24.0: "why so many downloads?" (577 of 733 precache entries changed), then "shouldnt this be all on demand?"

Investigation (both builds diffed): the 3.24.0 change touched `turrets/options.ts`, which `live/registry.ts:6` pulls into `core`. Core also lists the hashed names of the 83 chunks it lazy-loads in `__vite__mapDeps`, so a change to any of them renames core too (probe: markup-only edit to `turrets-overlay.svelte` → 576 entries). 570 chunks import `./core-<hash>.js` by name and are renamed with identical content. The 3.21.0 split only protects app-only edits (16-entry baseline). The overlay count is right: it counts only new manifest entries. `modulePreload: false` doesn't remove `mapDeps`.

### Cascade fix: import map (decided)
`index.html` carries a `<script type="importmap">` mapping a fixed specifier to core's hashed file; chunks import the fixed specifier, so a core change renames only core, `index.html` and what actually changed. Prototype first: Rollup may still fold dependency hashes into importers; if the import map can't stop it, fall back to the stable core name and report. Rejected: a stable `core.js` name (a load without the service worker can mix a cached old core with a new index for up to 10 minutes); moving live wallpapers out of core (fixes Pew edits only).
Core's lazy-load name list (`mapDeps`) has the same effect and must be covered too.

### On demand: keep precaching everything (decided)
With the cascade fixed, updates are ~20 files and every app keeps working offline. Rejected for now: shell-only precache with a background warm-up, and pure on-demand (apps not opened since the update fail offline).

### Action items
- [x] Import map built (3.26.1): `vite-plugin-import-map.ts`; chunks import `@webos/core`, core's lazy imports and preload list go through the map, core renamed from its final code. Precache entries renamed vs a rebuild: `turrets/options.ts` line 583 → 17, `turrets-overlay.svelte` markup 583 → 17, one app 17 → 17. ADR-036 revision, overview Chunks, version page.
