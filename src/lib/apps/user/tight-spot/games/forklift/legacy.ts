import kernel, { type FilesService } from "$lib/core/api";
import { app_data_path } from "$lib/core/contexts/app";
import { z } from "zod";
import type { Prefs } from "../../core/prefs";
import { better, bests_schema, data_schema, levels_schema, type Bests, type ForkliftData, type LevelStars, type Result } from "./game";

const KEYS = { bests: "forklift.best", levels: "forklift.levels" } as const;
const PATH = app_data_path("tight-spot", "forklift.json");

interface Legacy {
  bests: Bests;
  levels: LevelStars;
}

const legacy_schema = z.object({ [KEYS.bests]: bests_schema.catch({}), [KEYS.levels]: levels_schema.catch({}) });

function read_legacy(prefs: Prefs): Legacy | null {
  if (!Object.values(KEYS).some((key) => key in prefs.value)) return null;
  const legacy = legacy_schema.parse(prefs.value);
  return { bests: legacy[KEYS.bests], levels: legacy[KEYS.levels] };
}

function merge_best(saved: Result | undefined, old: Result): Result {
  const run = !saved || better(saved, old) ? old : saved;
  const top = Math.max(saved?.precision ?? -1, old.precision ?? -1);
  return top >= 0 ? { stars: run.stars, ms: run.ms, precision: top } : { stars: run.stars, ms: run.ms };
}

export function holds(data: ForkliftData, legacy: Legacy): boolean {
  const bests = Object.entries(legacy.bests).every(([key, old]) => {
    const saved = data.bests[key];
    return !!saved && !better(saved, old) && (old.precision ?? -1) <= (saved.precision ?? -1);
  });
  return bests && Object.entries(legacy.levels).every(([key, stars]) => (data.levels[key] ?? 0) >= stars);
}

export function fold(data: ForkliftData, legacy: Legacy): ForkliftData {
  const bests = { ...data.bests };
  for (const [key, old] of Object.entries(legacy.bests)) bests[key] = merge_best(bests[key], old);
  const levels = { ...data.levels };
  for (const [key, stars] of Object.entries(legacy.levels)) levels[key] = Math.max(levels[key] ?? 0, stars);
  return { bests, levels };
}

async function read_saved(): Promise<ForkliftData | null> {
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
export async function adopt_legacy(prefs: Prefs, data: { value: ForkliftData }): Promise<void> {
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
