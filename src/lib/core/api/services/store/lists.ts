import { ASSETS_CACHE } from "./cache";

export { ASSETS_CACHE };
const LEGACY_PREFIX = `${ASSETS_CACHE}-`;

/** The URL a list's file (`assets/…`, relative to the base) is cached under. */
export const file_url = (base: string, file: string) => new URL(base + file, location.origin).href;

/** The per-build caches from before. Only `webos-assets-*`: every lilbunnyrabbit site on the host shares the origin. */
export function legacy_caches(keys: string[]): string[] {
  return keys.filter((key) => key.startsWith(LEGACY_PREFIX));
}

export function unused(cached: string[], keep: ReadonlySet<string>): string[] {
  return cached.filter((file) => !keep.has(file));
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
