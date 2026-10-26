# Service worker features for the App Store
**Date:** 2026-10-26
**Participants:** owner, Claude (investigation agent)

## Context
Owner: "Is there any service worker functionality we are not using here that would be a great fit", then "spawn an agent to do a deeper check of what to do and why and add to roadmap to discuss". Measured on the current build: user app lists 11.3 MB raw, core 6.4 MB, wasm/onnx 40.9 MB. GitHub Pages sends `max-age=600`, gzip only. The manifest has no `id`, `shortcuts`, `launch_handler`, `file_handlers` or `share_target`; `registerSW.js` registers without `updateViaCache`. Support from mdn/browser-compat-data, 2026-10-26.

## Findings, best fit first
1. **Periodic Background Sync** (Chrome 80, experimental; installed PWA only, engagement-gated). With ADR-077 stage 3. While WebOS is closed the worker calls `registration.update()` (new core precached), reads installed entries from OPFS (`getDirectory()` works in workers), checks the core hash in `store/catalogue.json` and fills the asset cache under the store lock. The next launch boots the new build: no overlay, no download toast. Cost: an `importScripts` file like `sw-notifications.js`, stays on generateSW. Risk: a second downloader beside StoreService; the worker writes Cache Storage only and the tab reconciles. https://developer.chrome.com/docs/capabilities/periodic-background-sync
2. **BroadcastChannel / `clients.postMessage`** (baseline). With stage 3. A `webos:store` channel (`apps-ready`, core, apps) so other tabs show Update ready at once instead of when they become visible. A few lines.
3. **Persistent storage, asked again** (baseline). Now / stage 1. `persist()` is called once in FilesService (`files/service.svelte.ts:169`). Cache, OPFS and localStorage are evicted together, so without it the whole origin can go (Safari: 7-day cap for non-installed sites). Ask again after Install, PWA install, notification grant; show a note in the App Store when not persisted. The origin is shared with the other lilbunnyrabbit.github.io sites.
4. **`launch_handler` + `launchQueue`** (Chrome 110 / launchQueue 102 desktop). Owner call. Every OS launch (notification, `#/app/x` link) opens a second standalone WebOS: second kernel, second scheduler candidate, second session. `focus-existing` + `launchQueue` routes the URL into the running RouterService; Android needs `navigate-existing` plus a `hashchange` listener. ~20 lines and a manifest field.
5. **Static Routing (`addRoutes`)** (Chrome 123, Safari 27). With stage 3, after measuring. Routes `/assets/*` to a named cache without running worker JS. A rule names one cache and a miss goes to the network, so it needs one fixed asset cache holding core too (stage 3's single cache). Win is modest. https://developer.chrome.com/blog/service-worker-static-routing
6. **`updateViaCache: "none"`** (baseline). Now. The unhashed `sw-notifications.js` is read through the 600 s HTTP cache on update checks, so a new `sw.js` can install with an old helper; worse once a store helper is imported.
7. **Manifest `id`** now (`/webos/`, so a `start_url` change can't orphan installs); **`shortcuts`** optional (App Store, Terminal, Settings).
8. **`file_handlers`, `share_target`** (Chrome only). Later, own ADRs: open OS files into associated apps, share into WebOS on Android. Where the file lives is a persistence call.

Rejected: Background Fetch for app code (sizes are ordinary; maybe later for big model files), one-off Background Sync (periodic covers closed tabs), Storage Buckets (big OPFS migration), navigation preload (navigations come from the precache), Push (needs a backend), speculation rules (documents only), Compression Dictionary Transport (Pages can't set headers).

Note for stage 3: CDN edges can briefly mix an old `sw.js` / `catalogue.json` with new files; keep the build/core stamp in every catalogue entry and `no-cache` for `version.json` and `catalogue.json`.

## Open questions for the owner
1. Periodic sync: also download installed apps, or only precache the new core?
2. Should background updates respect Save-Data or metered connections?
3. Second launch: focus the running WebOS, or allow several standalone windows?
4. Static routing: measure a cold phone boot first? Move core into the single asset cache?
5. Show "storage not persistent" and per-app sizes in the App Store (a bytes field in the catalogue)?
6. File handlers / share target: import into OPFS (`/home/Downloads`?) or open in place by handle?
7. `updateViaCache: "none"` or hashed names for imported worker scripts?

## Topics discussed
## Key takeaways
## Action items
## Next session topics
