import { build_aliases, page_id, resolve_page, suggest_pages } from "./catalog";

const LOADERS = import.meta.glob<string>(["/docs/{system,adrs,design,apps}/**/*.md", "/docs/ROADMAP.md"], {
  query: "?raw&content",
  import: "default",
});

const BY_ID = new Map(Object.entries(LOADERS).map(([path, load]) => [page_id(path), load]));

export const PAGE_IDS: readonly string[] = [...BY_ID.keys()].sort();
export const PAGE_SET: ReadonlySet<string> = new Set(PAGE_IDS);
export const ALIASES = build_aliases(PAGE_IDS);

export function has_page(id: string): boolean {
  return BY_ID.has(id);
}

// A page that failed to load (offline) fails again from the module map at its own URL, so it loads from a fresh one. The
// URL is read here rather than with `load-error`'s helpers: importing those from an app moves them out of core.
const RETRY_URLS = new Map<string, string>();
const FAILED_URL = /(https?:\/\/[^\s?]+)\S*$/;
let retries = 0;

export function retry_page_url(error: unknown, attempt: number): string | null {
  const failed = FAILED_URL.exec(error instanceof Error ? error.message : "")?.[1];
  return failed ? `${failed}?retry=${attempt}` : null;
}

export async function load_page(id: string): Promise<string> {
  const load = BY_ID.get(id);
  if (!load) throw new Error(`No page called "${id}"`);
  const url = RETRY_URLS.get(id);
  try {
    return url ? ((await import(/* @vite-ignore */ url)) as { default: string }).default : await load();
  } catch (error) {
    const next = retry_page_url(error, ++retries);
    if (next) RETRY_URLS.set(id, next);
    throw error;
  }
}

export function find_page(topic: string): string | null {
  return resolve_page(PAGE_IDS, ALIASES, topic.split("#")[0]);
}

export function locate(topic: string): { id: string; hash: string } | null {
  const id = find_page(topic);
  const at = topic.indexOf("#");
  return id ? { id, hash: at < 0 ? "" : topic.slice(at + 1) } : null;
}

export function near_pages(topic: string, limit?: number): string[] {
  return suggest_pages(PAGE_IDS, ALIASES, topic, limit);
}
