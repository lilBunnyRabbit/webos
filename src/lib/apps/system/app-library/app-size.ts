import { ASSETS_CACHE, file_url } from "$lib/core/api/services/store/lists";

/** `null` when none of the files is in the installed apps' cache. A file another app shares counts for each app. */
export async function cached_size(base: string, files: readonly string[]): Promise<number | null> {
  if (files.length === 0) return null;
  const cache = await caches.open(ASSETS_CACHE);
  let total = 0;
  let found = 0;
  for (const file of files) {
    const response = await cache.match(file_url(base, file), { ignoreVary: true });
    if (!response) continue;
    found++;
    const length = Number(response.headers.get("content-length"));
    total += length > 0 ? length : (await response.blob()).size;
  }
  return found > 0 ? total : null;
}
