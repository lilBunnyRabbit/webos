import kernel, { type FilesService } from "$lib/core/api";
import { app_data_path } from "$lib/core/contexts/app";
import type { Prefs } from "../../core/prefs";
import { z } from "zod";
import { better, bests_schema, data_schema, levels_schema, type Bests, type LevelStars, type ParkingData, type Result } from "./game";

const KEYS = { bests: "parking.best", levels: "parking.levels", kinds: "parking.kinds" } as const;
const PATH = app_data_path("tight-spot", "parking.json");

interface Legacy {
  bests: Bests;
  levels: LevelStars;
  kinds: string[];
}

const legacy_schema = z.object({
  [KEYS.bests]: bests_schema.catch({}),
  [KEYS.levels]: levels_schema.catch({}),
  [KEYS.kinds]: z.array(z.string()).catch([]),
});

function read_legacy(prefs: Prefs): Legacy | null {
  if (!Object.values(KEYS).some((key) => key in prefs.value)) return null;
  const legacy = legacy_schema.parse(prefs.value);
  return { bests: legacy[KEYS.bests], levels: legacy[KEYS.levels], kinds: legacy[KEYS.kinds] };
}

function merge_best(saved: Result | undefined, old: Result): Result {
  const run = !saved || better(saved, old) ? old : saved;
  const top = Math.max(saved?.precision ?? -1, old.precision ?? -1);
  return top >= 0 ? { moves: run.moves, ms: run.ms, precision: top } : { moves: run.moves, ms: run.ms };
}

export function holds(data: ParkingData, legacy: Legacy): boolean {
  const bests = Object.entries(legacy.bests).every(([key, old]) => {
    const saved = data.bests[key];
    return !!saved && !better(saved, old) && (old.precision ?? -1) <= (saved.precision ?? -1);
  });
  return (
    bests &&
    Object.entries(legacy.levels).every(([key, stars]) => (data.levels[key] ?? 0) >= stars) &&
    legacy.kinds.every((kind) => data.kinds.includes(kind))
  );
}

export function fold(data: ParkingData, legacy: Legacy): ParkingData {
  const bests = { ...data.bests };
  for (const [key, old] of Object.entries(legacy.bests)) bests[key] = merge_best(bests[key], old);
  const levels = { ...data.levels };
  for (const [key, stars] of Object.entries(legacy.levels)) levels[key] = Math.max(levels[key] ?? 0, stars);
  return { bests, levels, kinds: [...new Set([...data.kinds, ...legacy.kinds])] };
}

async function read_saved(): Promise<ParkingData | null> {
  try {
    const file = await kernel.service<FilesService>("files").get_file(PATH);
    const parsed = file ? data_schema.safeParse(JSON.parse(await file.text())) : null;
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// The in-memory file is shared by every window and written 300 ms late, so it holding the keys proves nothing: they go
// only once the file on disk holds them, checked against the keys as they are then (a restored backup brings them back).
export async function adopt_legacy(prefs: Prefs, data: { value: ParkingData }): Promise<void> {
  const legacy = read_legacy(prefs);
  if (!legacy) return;
  if (!holds(data.value, legacy)) {
    data.value = fold(data.value, legacy);
    return;
  }
  const saved = await read_saved();
  const latest = read_legacy(prefs);
  if (!saved || !latest || !holds(saved, latest)) return;
  for (const key of Object.values(KEYS)) delete prefs.value[key];
}
