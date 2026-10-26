const CACHE_PREFIX = "webos-assets-";

export function assets_cache(build: number): string {
  return `${CACHE_PREFIX}${build}`;
}

/** Only `webos-assets-*`: every lilbunnyrabbit site on the same host shares the origin's Cache Storage. */
export function stale_caches(keys: string[], build: number): string[] {
  return keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== assets_cache(build));
}

/**
 * `null` when the list belongs to another build: a tab that missed an update would otherwise save the new build's
 * files under its own cache and call the app saved.
 */
export function parse_list(text: string, build: number): string[] | null {
  try {
    const data: unknown = JSON.parse(text);
    if (typeof data !== "object" || data === null) return null;
    const { build: list_build, files } = data as { build?: unknown; files?: unknown };
    if (list_build !== build || !Array.isArray(files) || !files.every((file) => typeof file === "string")) return null;
    return files;
  } catch {
    return null;
  }
}

export async function pool<T>(items: T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  let failed = false;
  const lane = async () => {
    while (!failed && next < items.length) {
      const item = items[next++];
      try {
        await work(item);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
}

/** App chunks are shared, so an uninstall may delete only the files no other installed app's list holds. */
export function unshared(files: string[], others: Iterable<string[]>): string[] {
  const kept = new Set<string>();
  for (const list of others) for (const file of list) kept.add(file);
  return files.filter((file) => !kept.has(file));
}
