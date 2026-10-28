import { APP_CATEGORY_LABELS, group_apps, search_apps } from "$lib/core/api/services/apps/search";
import { AppCategory, type AppId, type AppListing } from "$lib/core/api/services/apps/type";
import { recency } from "$lib/core/api/services/version/history";
import type { Release } from "$lib/core/api/services/version/type";
import type { Command } from "$lib/core/api/services/shell/type";

export const LibraryCategory = { ALL: "all", ...AppCategory, SYSTEM: "system" } as const;
export type LibraryCategory = (typeof LibraryCategory)[keyof typeof LibraryCategory];

export const LIBRARY_CATEGORIES: { id: LibraryCategory; label: string }[] = [
  { id: LibraryCategory.ALL, label: "All" },
  ...Object.values(AppCategory).map((id) => ({ id, label: APP_CATEGORY_LABELS[id] })),
  { id: LibraryCategory.SYSTEM, label: "System" },
];

export const LibraryFilter = {
  FAVOURITES: "favourites",
  WIDGET: "widget",
  FILES: "files",
  COMMANDS: "commands",
  USED: "used",
  NOT_INSTALLED: "not-installed",
} as const;
export type LibraryFilter = (typeof LibraryFilter)[keyof typeof LibraryFilter];

export const LibrarySort = {
  NAME: "name",
  CATEGORY: "category",
  RECENT: "recent",
} as const;
export type LibrarySort = (typeof LibrarySort)[keyof typeof LibrarySort];

export const ViewMode = { GRID: "grid", LIST: "list" } as const;
export type ViewMode = (typeof ViewMode)[keyof typeof ViewMode];

export const SearchSection = { RELATED: "related", SUGGESTED: "suggested" } as const;
export type SearchSection = (typeof SearchSection)[keyof typeof SearchSection];

const SEARCH_LABELS: Record<SearchSection, string> = { [SearchSection.RELATED]: "Related", [SearchSection.SUGGESTED]: "AI suggests" };

export interface LibrarySection {
  /** A category, a release version for the recent sort, or a `SearchSection`. */
  id: string;
  label: string | null;
  apps: AppListing[];
}

export interface LibraryQuery {
  query: string;
  category: LibraryCategory;
  filters: readonly LibraryFilter[];
  /** Apps with an open window, a recently closed one, or a remembered window frame. */
  used: ReadonlySet<AppId>;
  /** Installed apps, system ones included (ADR-040). */
  installed: ReadonlySet<AppId>;
  favourites?: ReadonlySet<AppId>;
  /** The sentence search's apps beyond the matches, best first. */
  related?: readonly AppListing[];
  suggested?: readonly AppListing[];
}

export function category_of(manifest: AppListing): Exclude<LibraryCategory, "all"> {
  return manifest.system ? LibraryCategory.SYSTEM : manifest.category;
}

export function has_filter(
  manifest: AppListing,
  filter: LibraryFilter,
  { used, installed, favourites }: Pick<LibraryQuery, "used" | "installed" | "favourites">
): boolean {
  switch (filter) {
    case LibraryFilter.FAVOURITES:
      return favourites?.has(manifest.id) ?? false;
    case LibraryFilter.WIDGET:
      return manifest.widget !== undefined;
    case LibraryFilter.FILES:
      return (manifest.associations?.length ?? 0) > 0 || (manifest.tools?.length ?? 0) > 0;
    case LibraryFilter.COMMANDS:
      return manifest.shell !== undefined;
    case LibraryFilter.USED:
      return used.has(manifest.id);
    case LibraryFilter.NOT_INSTALLED:
      return !installed.has(manifest.id);
  }
}

type Order = (a: AppListing, b: AppListing) => number;

const by_name: Order = (a, b) => a.name.localeCompare(b.name);

function filtered(list: readonly AppListing[], { filters, ...context }: Pick<LibraryQuery, "filters" | "used" | "installed" | "favourites">): AppListing[] {
  return list.filter((manifest) => filters.every((filter) => has_filter(manifest, filter, context)));
}

function matching(apps: Iterable<AppListing>, query: Omit<LibraryQuery, "category">): AppListing[] {
  return filtered(search_apps(apps, query.query), query);
}

function search_sections(query: Omit<LibraryQuery, "category">, keep: (manifest: AppListing) => boolean): LibrarySection[] {
  const sections: [SearchSection, readonly AppListing[]][] = [
    [SearchSection.RELATED, query.related ?? []],
    [SearchSection.SUGGESTED, query.suggested ?? []],
  ];
  return sections
    .map(([id, apps]) => ({ id, label: SEARCH_LABELS[id], apps: filtered(apps, query).filter(keep) }))
    .filter((section) => section.apps.length > 0);
}

function order_of(query: string, list: readonly AppListing[]): Order {
  if (!query.trim()) return by_name;
  const rank = new Map(list.map((manifest, index) => [manifest.id, index]));
  return (a, b) => rank.get(a.id)! - rank.get(b.id)!;
}

export function category_counts(apps: Iterable<AppListing>, query: Omit<LibraryQuery, "category">): Record<LibraryCategory, number> {
  const counts = Object.fromEntries(LIBRARY_CATEGORIES.map(({ id }) => [id, 0])) as Record<LibraryCategory, number>;
  for (const manifest of [...matching(apps, query), ...search_sections(query, () => true).flatMap((section) => section.apps)]) {
    counts[LibraryCategory.ALL]++;
    counts[category_of(manifest)]++;
  }
  return counts;
}

/** The sort picks the sections; a search keeps its relevance order inside them, then adds Related and AI suggests. */
export function library_sections(
  apps: Iterable<AppListing>,
  { category, sort, changelog = [], ...rest }: LibraryQuery & { sort: LibrarySort; changelog?: readonly Release[] }
): LibrarySection[] {
  const in_category = (manifest: AppListing) => category === LibraryCategory.ALL || category_of(manifest) === category;
  const list = matching(apps, rest).filter(in_category);
  return [...sorted_sections(list, sort, changelog, order_of(rest.query, list)), ...search_sections(rest, in_category)];
}

function sorted_sections(list: AppListing[], sort: LibrarySort, changelog: readonly Release[], order: Order): LibrarySection[] {
  if (list.length === 0) return [];
  if (sort === LibrarySort.CATEGORY) return group_apps(list).map((section) => ({ ...section, apps: section.apps.sort(order) }));
  if (sort === LibrarySort.RECENT) return recent_sections(list, changelog, order);
  return [{ id: LibraryCategory.ALL, label: null, apps: list.sort(order) }];
}

/** One section per release, newest first, holding the apps it last added or changed; apps it never mentions go last. */
function recent_sections(list: AppListing[], changelog: readonly Release[], order: Order): LibrarySection[] {
  const groups = new Map<number, AppListing[]>();
  for (const manifest of list) {
    const index = recency(changelog, manifest.id);
    groups.set(index, [...(groups.get(index) ?? []), manifest]);
  }
  return [...groups]
    .sort(([a], [b]) => a - b)
    .map(([index, apps]) => {
      const release = changelog[index];
      return {
        id: release?.version ?? "earlier",
        label: release ? `v${release.version} · ${release.title}` : "Earlier",
        apps: apps.sort(order),
      };
    });
}

export function app_story(manifest: AppListing): { problem: string | null; solution: string } {
  return manifest.pitch ?? { problem: null, solution: manifest.description ?? "" };
}

/** From the shell's registry, which holds the apps' commands once loaded (ADR-034). */
export function app_commands(manifest: AppListing, commands: readonly Command[]): { id: string; description: string }[] {
  return commands
    .filter((command) => command.app === manifest.id)
    .map(({ id, description }) => ({ id, description }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function sort_types(types: string[] | undefined): string[] {
  return [...(types ?? [])].sort((a, b) => Number(!a.startsWith(".")) - Number(!b.startsWith(".")) || a.localeCompare(b));
}

export function app_file_types(manifest: AppListing): { opens: string[]; works_on: string[] } {
  return { opens: sort_types(manifest.associations), works_on: sort_types(manifest.tools) };
}

export function category_label(manifest: AppListing): string {
  return manifest.system ? "System" : APP_CATEGORY_LABELS[manifest.category];
}
