/** `null` when none of the files is cached. A file another app shares counts for each app. */
export async function cached_size(base: string, files: readonly string[]): Promise<number | null> {
  if (files.length === 0) return null;
  let total = 0;
  let found = 0;
  for (const file of files) {
    const response = await caches.match(new URL(base + file, location.origin).href, { ignoreVary: true });
    if (!response) continue;
    found++;
    const length = Number(response.headers.get("content-length"));
    total += length > 0 ? length : (await response.blob()).size;
  }
  return found > 0 ? total : null;
}
