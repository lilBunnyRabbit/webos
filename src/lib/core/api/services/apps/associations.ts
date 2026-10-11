import type { AppManifest } from "./type";

/** `"Notes.TXT"` → `".txt"`. A dotfile is its own extension (`.env` → `".env"`). Names without a dot have none. */
export function file_extension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Exact extension 3, exact MIME 2, MIME wildcard 1, no match 0 (ADR-018). */
export function association_tier(entry: string, file: { name: string; type: string }): number {
  const pattern = entry.toLowerCase();
  if (pattern.startsWith(".")) return pattern === file_extension(file.name) ? 3 : 0;

  const type = file.type.toLowerCase();
  if (!type) return 0;
  if (pattern === type) return 2;
  if (pattern.endsWith("/*") && type.startsWith(pattern.slice(0, -1))) return 1;
  return 0;
}

/** The apps tied on the best tier for this file. Empty when nothing matches. */
export function best_apps_for(apps: Iterable<AppManifest>, file: { name: string; type: string }): AppManifest[] {
  let best_tier = 0;
  let best: AppManifest[] = [];

  for (const app of apps) {
    const tier = Math.max(0, ...(app.associations ?? []).map((entry) => association_tier(entry, file)));
    if (tier === 0 || tier < best_tier) continue;
    if (tier > best_tier) {
      best_tier = tier;
      best = [];
    }
    best.push(app);
  }

  return best;
}

/** Every app that can open `file`, most specific match first: the "Open with" list. */
export function apps_for(apps: Iterable<AppManifest>, file: { name: string; type: string }): AppManifest[] {
  return [...apps]
    .map((app) => ({ app, tier: Math.max(0, ...(app.associations ?? []).map((entry) => association_tier(entry, file))) }))
    .filter(({ tier }) => tier > 0)
    .sort((a, b) => b.tier - a.tier || a.app.name.localeCompare(b.app.name))
    .map(({ app }) => app);
}
