import type { StorageHandle } from "$lib/core/contexts/app";
import { z } from "zod";
import { bests_schema, levels_schema, type ParkingData } from "./game";

const KEYS = { bests: "parking.best", levels: "parking.levels", kinds: "parking.kinds" } as const;

// The file wins where both hold a key: another window or tab may have folded the keys in already.
export function adopt_legacy(storage: StorageHandle, data: { value: ParkingData }): void {
  const bests = storage.get(KEYS.bests, bests_schema);
  const levels = storage.get(KEYS.levels, levels_schema);
  const kinds = storage.get(KEYS.kinds, z.array(z.string()));
  if (bests || levels || kinds) {
    const now = data.value;
    const merged_levels = { ...now.levels };
    for (const [key, stars] of Object.entries(levels ?? {})) merged_levels[key] = Math.max(merged_levels[key] ?? 0, stars);
    data.value = {
      bests: { ...bests, ...now.bests },
      levels: merged_levels,
      kinds: [...new Set([...now.kinds, ...(kinds ?? [])])],
    };
  }
  for (const key of Object.values(KEYS)) storage.remove(key);
}
