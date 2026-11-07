import { z } from "zod";
import { LEVELS } from "./levels";

export const PROGRESS_FILE = "progress.json";

const best_schema = z.object({ stars: z.number().int().min(1).max(3), ms: z.number().nonnegative() });
export type Best = z.infer<typeof best_schema>;

export const progress_schema = z.object({
  version: z.literal(1).catch(1),
  bests: z.record(z.string(), best_schema).catch({}),
});
export type Progress = z.infer<typeof progress_schema>;

export const DEFAULT_PROGRESS: Progress = { version: 1, bests: {} };

/** More stars win, then the faster time. */
export function better(before: Best | undefined, run: Best): { best: Best; improved: boolean } {
  if (!before) return { best: run, improved: true };
  const improved = run.stars > before.stars || (run.stars === before.stars && run.ms < before.ms);
  return { best: improved ? run : before, improved };
}

/** Levels done at least once, across every plane's track. */
export function levels_done(bests: Progress["bests"]): number {
  return LEVELS.filter((level) => bests[`level-${level.plane}-${level.n}`]).length;
}
