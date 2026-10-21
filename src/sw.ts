/// <reference lib="webworker" />
import { clientsClaim } from "workbox-core";
import { CacheableResponsePlugin } from "workbox-cacheable-response";
import { ExpirationPlugin } from "workbox-expiration";
import { cleanupOutdatedCaches, PrecacheController, PrecacheRoute, type PrecacheEntry } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { install_precache, precache_targets } from "$lib/core/sw/install";
import { route_notification_clicks } from "$lib/core/sw/notification-clicks";

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (PrecacheEntry | string)[] };

const precache = new PrecacheController();
precache.addToCacheList(self.__WB_MANIFEST);

self.skipWaiting();
clientsClaim();

// In place of Workbox's install, which downloads one file at a time. Same cache and keys, so a worker this replaces
// leaves its files for this one, and Workbox's activate still drops what the new manifest no longer lists.
self.addEventListener("install", (event) => {
  const targets = precache_targets(precache.getURLsToCacheKeys());
  event.waitUntil(caches.open(precache.strategy.cacheName).then((cache) => install_precache(targets, cache, fetch)));
});
self.addEventListener("activate", precache.activate);
cleanupOutdatedCaches();

registerRoute(new PrecacheRoute(precache));
registerRoute(new NavigationRoute(precache.createHandlerBoundToURL("index.html")));

// Codec wasm (2–3.5 MB each), ONNX Runtime's wasm and Shopping List's text models stay out of the install; cached on
// first use so AVIF, JPEG XL and reading a shopping list from a photo then work offline.
registerRoute(
  /\.(wasm|onnx)$/,
  new CacheFirst({ cacheName: "webos-wasm", plugins: [new ExpirationPlugin({ maxEntries: 16 })] })
);
// Built-in app fonts (Burrow), about 0.5 MB, cached when first chosen. Content-hashed names, so a fixed font is a new entry.
registerRoute(
  /\.(ttf|ttc)$/,
  new CacheFirst({
    cacheName: "webos-fonts",
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 8 })],
  })
);
// Warren's .docx import (~100 KB gzipped), which few installs ever use.
registerRoute(
  /\/assets\/mammoth-[^/]+\.js$/,
  new CacheFirst({
    cacheName: "webos-mammoth",
    plugins: [new CacheableResponsePlugin({ statuses: [200] }), new ExpirationPlugin({ maxEntries: 2 })],
  })
);

route_notification_clicks(self);
