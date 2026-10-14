import { file_extension } from "../files/path";
import type { AppManifest } from "./type";

export { file_extension };

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
    .map((app) => ({
      app,
      tier: Math.max(0, ...(app.associations ?? []).map((entry) => association_tier(entry, file))),
    }))
    .filter(({ tier }) => tier > 0)
    .sort((a, b) => b.tier - a.tier || a.app.name.localeCompare(b.app.name))
    .map(({ app }) => app);
}

/** Apps that list `file` under `tools` and aren't already associated with it, by name: the end of the "Open with" list. */
export function tools_for(apps: Iterable<AppManifest>, file: { name: string; type: string }): AppManifest[] {
  const matches = (entries: string[] | undefined) => (entries ?? []).some((entry) => association_tier(entry, file) > 0);
  return [...apps]
    .filter((app) => matches(app.tools) && !matches(app.associations))
    .sort((a, b) => a.name.localeCompare(b.name));
}
