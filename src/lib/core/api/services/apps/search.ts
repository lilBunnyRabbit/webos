import { AppCategory, type AppManifest } from "./type";

export const APP_CATEGORY_LABELS: Record<AppCategory, string> = {
  [AppCategory.PRODUCTIVITY]: "Productivity",
  [AppCategory.MEDIA]: "Media",
  [AppCategory.UTILITIES]: "Utilities",
  [AppCategory.DEVELOPER]: "Developer",
  [AppCategory.GAMES]: "Games",
};

export interface AppSection {
  id: AppCategory | "system";
  label: string;
  apps: AppManifest[];
}

function by_name(a: AppManifest, b: AppManifest): number {
  return a.name.localeCompare(b.name);
}

/** Lower is better, `null` is no match. */
function rank(manifest: AppManifest, needle: string): number | null {
  const name = manifest.name.toLowerCase();
  if (name.startsWith(needle)) return 0;
  if (name.split(/[\s-]+/).some((word) => word.startsWith(needle))) return 1;
  if (name.includes(needle)) return 2;
  const includes = (text: string) => text.toLowerCase().includes(needle);
  if ([manifest.id, ...(manifest.keywords ?? [])].some(includes)) return 3;
  if ([manifest.description ?? "", APP_CATEGORY_LABELS[manifest.category]].some(includes)) return 4;
  return null;
}

/**
 * Every app sorted by name, or the apps matching `query` (case-insensitive substring) best first: name prefix, a word
 * in the name, anywhere in the name, id or keywords, then description or category. Ties sort by name.
 */
export function search_apps(apps: Iterable<AppManifest>, query: string): AppManifest[] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [...apps].sort(by_name);
  return [...apps]
    .map((manifest) => ({ manifest, rank: rank(manifest, needle) }))
    .filter((entry): entry is { manifest: AppManifest; rank: number } => entry.rank !== null)
    .sort((a, b) => a.rank - b.rank || by_name(a.manifest, b.manifest))
    .map((entry) => entry.manifest);
}

/** Apps grouped for the launcher: one section per category in declaration order, system apps last. Empty ones are left out. */
export function group_apps(apps: Iterable<AppManifest>): AppSection[] {
  const sections: AppSection[] = [
    ...Object.values(AppCategory).map((id) => ({ id, label: APP_CATEGORY_LABELS[id], apps: [] as AppManifest[] })),
    { id: "system", label: "System", apps: [] },
  ];
  for (const manifest of [...apps].sort(by_name)) {
    sections.find((section) => section.id === (manifest.system ? "system" : manifest.category))!.apps.push(manifest);
  }
  return sections.filter((section) => section.apps.length > 0);
}
