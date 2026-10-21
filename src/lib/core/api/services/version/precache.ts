export interface PrecacheEntry {
  url: string;
  revision: string | null;
}

// The shape `generateSW` writes into sw.js. If Workbox ever writes it differently, this finds nothing and the overlay
// shows only the elapsed time.
const ENTRY = /\{url:"([^"]+)",revision:(?:null|"([^"]*)")\}/g;

export function parse_precache_manifest(source: string): PrecacheEntry[] {
  return Array.from(source.matchAll(ENTRY), ([, url, revision]) => ({ url, revision: revision ?? null }));
}

/** Mirrors workbox-precaching's `createCacheKey`. */
export function precache_key(entry: PrecacheEntry, script_url: string): string {
  const url = new URL(entry.url, script_url);
  if (entry.revision) url.searchParams.set("__WB_REVISION__", entry.revision);
  return url.href;
}

export function precache_cache_name(scope: string): string {
  return `workbox-precache-v2-${scope}`;
}

/** Workbox skips entries already in the cache, so only the rest are downloaded. */
export function keys_to_download(manifest: PrecacheEntry[], script_url: string, cached_before: Set<string>): string[] {
  return manifest.map((entry) => precache_key(entry, script_url)).filter((key) => !cached_before.has(key));
}

export function count_cached(keys: string[], cached: Set<string>): number {
  return keys.reduce((count, key) => count + (cached.has(key) ? 1 : 0), 0);
}

export function progress_line(done: number, total: number | null, elapsed_ms: number): string {
  const seconds = `${Math.floor(elapsed_ms / 1000)} s`;
  if (total === null || total === 0) return seconds;
  return `${Math.min(done, total)} of ${total} files · ${seconds}`;
}
