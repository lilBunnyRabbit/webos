import { search_ranked, type SearchText } from "$lib/core/utils/search";
import { AppCategory, type AppListing, type AppManifest } from "./type";

export { within_one_edit } from "$lib/core/utils/search";

export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  [AppCategory.PRODUCTIVITY]: "Productivity",
  [AppCategory.MEDIA]: "Media",
  [AppCategory.UTILITIES]: "Utilities",
  [AppCategory.DEVELOPER]: "Developer",
  [AppCategory.GAMES]: "Games",
};

export interface AppSection<T extends AppManifest = AppManifest> {
  id: AppCategory | "system";
  label: string;
  apps: T[];
}

function by_name(a: AppManifest, b: AppManifest): number {
  return a.name.localeCompare(b.name);
}

const text_of = (manifest: AppListing): SearchText => ({
  name: manifest.name,
  keywords: [manifest.id, ...(manifest.keywords ?? [])],
  other: [manifest.description ?? "", APP_CATEGORY_LABELS[manifest.category]],
});

/**
 * Every app sorted by name, or the apps matching `query` best first (`search_ranked`: name, then id and keywords,
 * then description and category, one typo forgiven in long words). Ties sort by name.
 */
export function search_apps<T extends AppListing>(apps: Iterable<T>, query: string): T[] {
  if (query.trim() === "") return [...apps].sort(by_name);
  return search_ranked(apps, query, text_of, by_name);
}

/** The apps whose name matches `query`, best first (`search_ranked` on the name alone); every app sorted by name when it's blank. */
export function search_app_names<T extends AppListing>(apps: Iterable<T>, query: string): T[] {
  if (query.trim() === "") return [...apps].sort(by_name);
  return search_ranked(apps, query, (manifest) => ({ name: manifest.name, keywords: [], other: [] }), by_name);
}

/** Apps grouped for the launcher: one section per category in declaration order, system apps last. Empty ones are left out. */
export function group_apps<T extends AppManifest>(apps: Iterable<T>): AppSection<T>[] {
  const sections: AppSection<T>[] = [
    ...Object.values(AppCategory).map((id) => ({ id, label: APP_CATEGORY_LABELS[id], apps: [] as T[] })),
    { id: "system", label: "System", apps: [] },
  ];
  for (const manifest of [...apps].sort(by_name)) {
    sections.find((section) => section.id === (manifest.system ? "system" : manifest.category))!.apps.push(manifest);
  }
  return sections.filter((section) => section.apps.length > 0);
}
