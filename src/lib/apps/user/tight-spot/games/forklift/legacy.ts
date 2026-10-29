import type { StorageHandle } from "$lib/core/contexts/app";
import { bests_schema, levels_schema, type ForkliftData } from "./game";

const KEYS = { bests: "forklift.best", levels: "forklift.levels" } as const;

// The file wins where both hold a key: another window or tab may have folded the keys in already.
export function adopt_legacy(storage: StorageHandle, data: { value: ForkliftData }): void {
  const bests = storage.get(KEYS.bests, bests_schema);
  const levels = storage.get(KEYS.levels, levels_schema);
  if (bests || levels) {
    const now = data.value;
    const merged_levels = { ...now.levels };
    for (const [key, stars] of Object.entries(levels ?? {})) merged_levels[key] = Math.max(merged_levels[key] ?? 0, stars);
    data.value = { bests: { ...bests, ...now.bests }, levels: merged_levels };
  }
  for (const key of Object.values(KEYS)) storage.remove(key);
}
