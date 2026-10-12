/** Query parameter `apply_update()` adds to force a fresh document; stripped again at boot. */
export const UPDATE_PARAM = "__upd";

export function with_update_param(href: string, stamp: number): string {
  const url = new URL(href);
  url.searchParams.set(UPDATE_PARAM, String(stamp));
  return url.toString();
}

/** The URL without the update parameter, or `null` when it has none. */
export function strip_update_param(href: string): string | null {
  const url = new URL(href);
  if (!url.searchParams.has(UPDATE_PARAM)) return null;
  url.searchParams.delete(UPDATE_PARAM);
  return url.pathname + url.search + url.hash;
}

/** Cache Storage keys that belong to this app's service worker. Workbox names its caches after the registration scope. */
export function scope_caches(keys: string[], scope: string): string[] {
  return keys.filter((key) => key.includes(scope));
}
