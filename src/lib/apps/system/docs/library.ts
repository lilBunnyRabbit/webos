import { count_revisions, parse_adr_index, type AdrEntry } from "./adr-index";
import { ADR_INDEX_ID, fallback_title, group_of, GROUP_LABELS, type DocGroup } from "./catalog";
import { outline, type Outline } from "./outline";
import { load_page, PAGE_IDS } from "./pages";

export interface PageInfo extends Outline {
  id: string;
  group: DocGroup;
}

export interface Library {
  pages: Map<string, PageInfo>;
  adrs: (AdrEntry & { revisions: number })[];
}

export interface SearchHit {
  id: string;
  title: string;
  heading?: { text: string; slug: string };
  place: string;
}

export function placeholder_info(id: string): PageInfo {
  return { id, group: group_of(id), title: fallback_title(id), headings: [] };
}

let loading: Promise<Library> | null = null;

/** Every page's title and headings, and the ADR index with revision counts. Loads all page chunks once per app session. */
export function load_library(): Promise<Library> {
  // Pages load on read (ADR-077): offline, the ones never read are missing and the next open tries them again.
  loading ??= Promise.allSettled(PAGE_IDS.map(async (id) => [id, await load_page(id)] as const)).then((settled) => {
    const loaded = settled.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    if (loaded.length < settled.length) loading = null;
    const texts = new Map(loaded);
    const pages = new Map(PAGE_IDS.map((id) => [id, texts.has(id) ? { id, group: group_of(id), ...outline(texts.get(id)!, fallback_title(id)) } : placeholder_info(id)]));
    const adrs = parse_adr_index(texts.get(ADR_INDEX_ID) ?? "").map((entry) => ({
      ...entry,
      revisions: count_revisions(texts.get(entry.id) ?? ""),
    }));
    return { pages, adrs };
  });
  loading.catch(() => (loading = null));
  return loading;
}

export function search_library(pages: Iterable<PageInfo>, query: string, limit = 40): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const matches = (text: string) => words.every((word) => text.toLowerCase().includes(word));
  const titles: SearchHit[] = [];
  const headings: SearchHit[] = [];
  for (const page of pages) {
    const place = GROUP_LABELS[page.group];
    if (matches(`${page.title} ${page.id}`)) titles.push({ id: page.id, title: page.title, place });
    for (const heading of page.headings) {
      if (matches(heading.text)) headings.push({ id: page.id, title: page.title, heading, place: `${place} › ${page.title}` });
    }
  }
  const rank = (hit: SearchHit) => (hit.heading ?? { text: hit.title }).text.toLowerCase().indexOf(words[0]);
  titles.sort((a, b) => rank(a) - rank(b));
  return [...titles, ...headings].slice(0, limit);
}
