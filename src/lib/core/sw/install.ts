export interface PrecacheTarget {
  url: string;
  /** Its key in the precache: the URL, plus Workbox's `__WB_REVISION__` for a file whose name isn't content-hashed. */
  key: string;
}

export interface InstallOptions {
  concurrency: number;
  attempts: number;
  /** Before the second try; doubles after each. */
  backoff_ms: number;
}

export const INSTALL_OPTIONS: InstallOptions = { concurrency: 12, attempts: 3, backoff_ms: 500 };

export type Fetcher = (request: Request) => Promise<Response>;

export interface PrecacheStore {
  keys(): Promise<readonly Request[]>;
  put(key: string, response: Response): Promise<void>;
}

export function precache_targets(urls_to_keys: ReadonlyMap<string, string>): PrecacheTarget[] {
  return Array.from(urls_to_keys, ([url, key]) => ({ url, key }));
}

export function missing_targets(targets: readonly PrecacheTarget[], cached: ReadonlySet<string>): PrecacheTarget[] {
  return targets.filter((target) => !cached.has(target.key));
}

/** Workbox's choice: a file kept under one name across builds may sit stale in the HTTP cache, so it skips it. */
export function cache_mode(target: PrecacheTarget, attempt: number): RequestCache {
  return attempt > 0 || target.key !== target.url ? "reload" : "default";
}

/** The first failure stops new work and rejects. */
export async function run_limited<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function download(target: PrecacheTarget, fetcher: Fetcher, options: InstallOptions): Promise<Response> {
  let failure: unknown = null;
  for (let attempt = 0; attempt < options.attempts; attempt++) {
    if (attempt > 0) await delay(options.backoff_ms * 2 ** (attempt - 1));
    try {
      const response = await fetcher(new Request(target.url, { cache: cache_mode(target, attempt), credentials: "same-origin" }));
      if (response.ok) return response;
      failure = new Error(`${target.url}: ${response.status}`);
    } catch (error) {
      failure = error;
    }
  }
  throw failure;
}

// A redirected response can't answer a navigation, so it's stored as a plain copy (Workbox does the same).
async function storable(response: Response): Promise<Response> {
  if (!response.redirected) return response;
  const { status, statusText, headers } = response;
  return new Response(await response.blob(), { status, statusText, headers });
}

/**
 * Downloads the files the precache doesn't hold yet, `concurrency` at a time, into the same keys Workbox uses; files
 * already there stay. Reads the cache's keys once instead of matching file by file. Resolves how many it downloaded.
 */
export async function install_precache(
  targets: readonly PrecacheTarget[],
  store: PrecacheStore,
  fetcher: Fetcher,
  options: InstallOptions = INSTALL_OPTIONS
): Promise<number> {
  const cached = new Set((await store.keys()).map((request) => request.url));
  const missing = missing_targets(targets, cached);
  await run_limited(missing, options.concurrency, async (target) => {
    await store.put(target.key, await storable(await download(target, fetcher, options)));
  });
  return missing.length;
}
