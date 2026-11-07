import { z } from "zod";

export const PROGRESS_FILE = "progress.json";

export const best_schema = z.object({ stars: z.number().int().min(1).max(3), ms: z.number().nonnegative() });
export type Best = z.infer<typeof best_schema>;

export function progress_schema_of<B extends z.ZodType<Best>>(best: B) {
  return z.object({
    version: z.literal(1).catch(1),
    bests: z.record(z.string(), best).catch({}),
  });
}

/** More stars win, then the faster time. */
export function better<B extends Best>(before: B | undefined, run: B): { best: B; improved: boolean } {
  if (!before) return { best: run, improved: true };
  const improved = run.stars > before.stars || (run.stars === before.stars && run.ms < before.ms);
  return { best: improved ? run : before, improved };
}
