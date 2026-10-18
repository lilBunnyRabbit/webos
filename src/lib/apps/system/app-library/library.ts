import { APP_CATEGORY_LABELS, group_apps, search_apps } from "$lib/core/api/services/apps/search";
import { AppCategory, type AppId, type AppManifest } from "$lib/core/api/services/apps/type";
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

export interface LibrarySection {
  /** A category, or a release version for the recent sort. */
  id: string;
  label: string | null;
  apps: AppManifest[];
}

export interface LibraryQuery {
  query: string;
  category: LibraryCategory;
  filters: readonly LibraryFilter[];
  /** Apps with an open window, a recently closed one, or a remembered window frame. */
  used: ReadonlySet<AppId>;
  /** Installed apps, system ones included (ADR-040). */
  installed: ReadonlySet<AppId>;
}

export function category_of(manifest: AppManifest): Exclude<LibraryCategory, "all"> {
  return manifest.system ? LibraryCategory.SYSTEM : manifest.category;
}

export function has_filter(manifest: AppManifest, filter: LibraryFilter, { used, installed }: Pick<LibraryQuery, "used" | "installed">): boolean {
  switch (filter) {
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

function matching(apps: Iterable<AppManifest>, { query, filters, ...context }: Omit<LibraryQuery, "category">): AppManifest[] {
  return search_apps(apps, query).filter((manifest) => filters.every((filter) => has_filter(manifest, filter, context)));
}

export function category_counts(apps: Iterable<AppManifest>, query: Omit<LibraryQuery, "category">): Record<LibraryCategory, number> {
  const counts = Object.fromEntries(LIBRARY_CATEGORIES.map(({ id }) => [id, 0])) as Record<LibraryCategory, number>;
  for (const manifest of matching(apps, query)) {
    counts[LibraryCategory.ALL]++;
    counts[category_of(manifest)]++;
  }
  return counts;
}

/** The search only narrows; the order always comes from `sort`, so tiles keep their order while typing. */
export function library_sections(
  apps: Iterable<AppManifest>,
  { category, sort, changelog = [], ...rest }: LibraryQuery & { sort: LibrarySort; changelog?: readonly Release[] }
): LibrarySection[] {
  const list = matching(apps, rest).filter((manifest) => category === LibraryCategory.ALL || category_of(manifest) === category);
  if (list.length === 0) return [];
  if (sort === LibrarySort.CATEGORY) return group_apps(list);
  if (sort === LibrarySort.RECENT) return recent_sections(list, changelog);
  return [{ id: LibraryCategory.ALL, label: null, apps: list.sort((a, b) => a.name.localeCompare(b.name)) }];
}

/** One section per release, newest first, holding the apps it last added or changed; apps it never mentions go last. */
function recent_sections(list: AppManifest[], changelog: readonly Release[]): LibrarySection[] {
  const groups = new Map<number, AppManifest[]>();
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
        apps: apps.sort((a, b) => a.name.localeCompare(b.name)),
      };
    });
}

export function showcase_sections(apps: Iterable<AppManifest>, { query, category }: { query: string; category: LibraryCategory }): LibrarySection[] {
  const list = search_apps(apps, query);
  return LIBRARY_CATEGORIES.filter(({ id }) => id !== LibraryCategory.ALL && (category === LibraryCategory.ALL || id === category))
    .map(({ id, label }) => ({ id, label, apps: list.filter((manifest) => category_of(manifest) === id).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((section) => section.apps.length > 0);
}

export function app_story(manifest: AppManifest): { problem: string | null; solution: string } {
  return manifest.pitch ?? { problem: null, solution: manifest.description ?? "" };
}

/** From the shell's registry, which holds the apps' commands once loaded (ADR-034). */
export function app_commands(manifest: AppManifest, commands: readonly Command[]): { id: string; description: string }[] {
  return commands
    .filter((command) => command.app === manifest.id)
    .map(({ id, description }) => ({ id, description }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function sort_types(types: string[] | undefined): string[] {
  return [...(types ?? [])].sort((a, b) => Number(!a.startsWith(".")) - Number(!b.startsWith(".")) || a.localeCompare(b));
}

export function app_file_types(manifest: AppManifest): { opens: string[]; works_on: string[] } {
  return { opens: sort_types(manifest.associations), works_on: sort_types(manifest.tools) };
}

export function category_label(manifest: AppManifest): string {
  return manifest.system ? "System" : APP_CATEGORY_LABELS[manifest.category];
}
