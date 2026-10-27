import type { Achievement } from "./definition";

/** Kept when an app is uninstalled with its data (ADR-078). Here, apart from `persistence.ts`, so AppsService pulls no schema into core. */
export const ACHIEVEMENTS_FILE = "achievements.json";

/** Ids of the built-in active-time achievements every app has. */
export const BUILTIN_PREFIX = "os.";

/** Why the list can't be used: duplicate or reserved ids, a goal that isn't a whole number above 0. */
export function achievements_problem(defs: readonly Achievement[]): string | null {
  const seen = new Set<string>();
  for (const def of defs) {
    if (!def.id || def.id.startsWith(BUILTIN_PREFIX)) return `"${def.id}" isn't a usable id`;
    if (seen.has(def.id)) return `"${def.id}" is declared twice`;
    seen.add(def.id);
    if (def.goal !== undefined && !(Number.isInteger(def.goal) && def.goal > 0)) return `"${def.id}" needs a whole goal above 0`;
  }
  return null;
}
