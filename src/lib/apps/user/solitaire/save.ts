import { z } from "zod";
import { move_schema, type Draw, type Move } from "./klondike";

export const draw_schema: z.ZodType<Draw> = z.union([z.literal(1), z.literal(3)]);

export const saved_schema = z.object({
  version: z.literal(1),
  seed: z.number().int(),
  draw: draw_schema,
  moves: z.array(move_schema),
  elapsed: z.number().min(0),
  counted: z.boolean(),
  won: z.boolean(),
});
export type Saved = z.infer<typeof saved_schema>;

export const save_file_schema = z.object({ version: z.literal(1), day: z.string().nullable(), game: saved_schema.nullable() });
export type SaveFile = z.infer<typeof save_file_schema>;
export const EMPTY_SAVE: SaveFile = { version: 1, day: null, game: null };

export function to_saved(seed: number, draw: Draw, moves: readonly Move[], elapsed: number, counted: boolean, won: boolean): Saved {
  return { version: 1, seed, draw, moves: [...moves], elapsed: Math.round(elapsed), counted, won };
}

const entry_schema = z.object({
  played: z.number().int().min(0),
  won: z.number().int().min(0),
  best_ms: z.number().nullable(),
  best_score: z.number().nullable(),
});
export type StatsEntry = z.infer<typeof entry_schema>;

export const stats_schema = z.object({ draw1: entry_schema, draw3: entry_schema });
export type Stats = z.infer<typeof stats_schema>;

const empty_entry = (): StatsEntry => ({ played: 0, won: 0, best_ms: null, best_score: null });
export const empty_stats = (): Stats => ({ draw1: empty_entry(), draw3: empty_entry() });

export const stats_key = (draw: Draw): keyof Stats => (draw === 1 ? "draw1" : "draw3");

export function record_played(stats: Stats, draw: Draw): Stats {
  const key = stats_key(draw);
  return { ...stats, [key]: { ...stats[key], played: stats[key].played + 1 } };
}

export function record_win(stats: Stats, draw: Draw, ms: number, score: number): Stats {
  const key = stats_key(draw);
  const entry = stats[key];
  return {
    ...stats,
    [key]: {
      ...entry,
      won: entry.won + 1,
      best_ms: entry.best_ms === null ? ms : Math.min(entry.best_ms, ms),
      best_score: entry.best_score === null ? score : Math.max(entry.best_score, score),
    },
  };
}
