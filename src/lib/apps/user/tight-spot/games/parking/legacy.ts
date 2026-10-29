import type { StorageHandle } from "$lib/core/contexts/app";
import { z } from "zod";
import { bests_schema, levels_schema, type ParkingData } from "./game";

const KEYS = { bests: "parking.best", levels: "parking.levels", kinds: "parking.kinds" } as const;

// The file wins where both hold a key: another window or tab may have folded the keys in already. The keys go only once a
// load finds the file holding them: the file's write is debounced, and a tab closed before it lands would lose them.
export function adopt_legacy(storage: StorageHandle, data: { value: ParkingData }): void {
  const bests = storage.get(KEYS.bests, bests_schema) ?? {};
  const levels = storage.get(KEYS.levels, levels_schema) ?? {};
  const kinds = storage.get(KEYS.kinds, z.array(z.string())) ?? [];
  const now = data.value;
  const held =
    Object.keys(bests).every((key) => key in now.bests) &&
    Object.entries(levels).every(([key, stars]) => (now.levels[key] ?? 0) >= stars) &&
    kinds.every((kind) => now.kinds.includes(kind));
  if (held) {
    for (const key of Object.values(KEYS)) storage.remove(key);
    return;
  }
  const merged_levels = { ...now.levels };
  for (const [key, stars] of Object.entries(levels)) merged_levels[key] = Math.max(merged_levels[key] ?? 0, stars);
  data.value = { bests: { ...bests, ...now.bests }, levels: merged_levels, kinds: [...new Set([...now.kinds, ...kinds])] };
}
