import type { AppManifest } from "./type";

/** Every app sorted by name, or those whose name, id or keywords contain `query` (case-insensitive). */
export function search_apps(apps: Iterable<AppManifest>, query: string): AppManifest[] {
  const all = [...apps].sort((a, b) => a.name.localeCompare(b.name));
  const needle = query.trim().toLowerCase();
  if (needle === "") return all;
  return all.filter((manifest) =>
    [manifest.name, manifest.id, ...(manifest.keywords ?? [])].some((text) => text.toLowerCase().includes(needle))
  );
}
