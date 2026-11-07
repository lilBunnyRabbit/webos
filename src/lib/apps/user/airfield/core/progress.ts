import type { z } from "zod";
import { best_schema, progress_schema_of, type Best } from "$kit/games/play2d/progress";
import { LEVELS } from "./levels";

export { better, PROGRESS_FILE } from "$kit/games/play2d/progress";
export type { Best };

export const progress_schema = progress_schema_of(best_schema);
export type Progress = z.infer<typeof progress_schema>;

export const DEFAULT_PROGRESS: Progress = { version: 1, bests: {} };

/** Levels done at least once, across every plane's track. */
export function levels_done(bests: Progress["bests"]): number {
  return LEVELS.filter((level) => bests[`level-${level.plane}-${level.n}`]).length;
}
