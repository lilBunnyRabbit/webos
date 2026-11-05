import { z } from "zod";
import { Level } from "./modes";

/** The four colour games each keep the shared frame's state here, apart from their boards' `storage.json`. */
export const GAME_FILE = "color-game.json";

const daily_schema = z.object({ day: z.string(), state: z.unknown() });

export const game_file_schema = z.object({
  /** The 4.0 boot copy left `level` and `daily` in `storage.json`; they move here once. */
  folded: z.boolean().catch(false),
  level: z.enum(Level).catch(Level.EASY),
  daily: daily_schema.nullable().catch(null),
});
export type GameFile = z.infer<typeof game_file_schema>;

export function empty_game_file(): GameFile {
  return { folded: false, level: Level.EASY, daily: null };
}

// Loose, so folding the frame's keys out of storage.json keeps the board's keys in it.
export const legacy_schema = z.looseObject({
  level: z.enum(Level).optional().catch(undefined),
  daily: daily_schema.optional().catch(undefined),
});
export type Legacy = z.infer<typeof legacy_schema>;
