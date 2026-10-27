/** One cache for every app's files, across releases (ADR-077 stage 3); the service worker rule in `vite.config.ts` uses it too, so this file imports nothing. */
export const ASSETS_CACHE = "webos-assets";
