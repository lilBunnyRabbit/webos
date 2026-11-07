import { better as kit_better, best_schema as kit_best_schema, progress_schema_of } from "$kit/games/play2d/progress";
import { z } from "zod";
import { BOAT_IDS, BoatId } from "./boats";
import { ThrottleMode } from "./lever";
import { LEVELS } from "./levels";

export { PROGRESS_FILE } from "$kit/games/play2d/progress";
export const SETTINGS_FILE = "settings.json";

const best_schema = kit_best_schema.extend({ perfect: z.boolean().catch(false) });
export type Best = z.infer<typeof best_schema>;

export const progress_schema = progress_schema_of(best_schema);
export type Progress = z.infer<typeof progress_schema>;

export const settings_schema = z.object({
  boat: z.enum(BOAT_IDS).catch(BoatId.RIB),
  throttle: z.enum([ThrottleMode.LEVER, ThrottleMode.HOLD]).catch(ThrottleMode.LEVER),
  sound: z.boolean().catch(true),
  seen_hint: z.boolean().catch(false),
});
export type Settings = z.infer<typeof settings_schema>;

export const DEFAULT_PROGRESS: Progress = { version: 1, bests: {} };
export const DEFAULT_SETTINGS: Settings = { boat: BoatId.RIB, throttle: ThrottleMode.LEVER, sound: true, seen_hint: false };

/** More stars win, then the faster time; a Perfect is kept once earned. */
export function better(before: Best | undefined, run: Best): { best: Best; improved: boolean } {
  const { best, improved } = kit_better(before, run);
  return { best: before ? { ...best, perfect: run.perfect || before.perfect } : best, improved };
}

/** Levels docked at least once, in either boat. */
export function levels_done(bests: Progress["bests"]): number {
  return LEVELS.filter((level) => BOAT_IDS.some((boat) => bests[`level-${level.id}-${boat}`])).length;
}
