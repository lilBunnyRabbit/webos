import { build_aliases, page_id, resolve_page, suggest_pages } from "./catalog";

const LOADERS = import.meta.glob<string>(["/docs/{system,adrs,design,apps}/**/*.md", "/docs/ROADMAP.md"], {
  query: "?raw",
  import: "default",
});

const BY_ID = new Map(Object.entries(LOADERS).map(([path, load]) => [page_id(path), load]));

export const PAGE_IDS: readonly string[] = [...BY_ID.keys()].sort();
export const PAGE_SET: ReadonlySet<string> = new Set(PAGE_IDS);
export const ALIASES = build_aliases(PAGE_IDS);

export function has_page(id: string): boolean {
  return BY_ID.has(id);
}

export function load_page(id: string): Promise<string> {
  const load = BY_ID.get(id);
  return load ? load() : Promise.reject(new Error(`No page called "${id}"`));
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
