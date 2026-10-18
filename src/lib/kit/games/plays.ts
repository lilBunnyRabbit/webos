import { z } from "zod";

export const PLAYS_PATH = "/var/lib/games/plays.json";

const GameStatsSchema = z.object({ ms: z.number(), sessions: z.number(), last: z.string() });
const DailySchema = z.object({ ms: z.number(), score: z.number().optional() });

export const PlaysSchema = z.object({
  version: z.literal(1),
  games: z.record(z.string(), GameStatsSchema),
  /** Solved daily puzzles: day (`YYYY-MM-DD`) → app id → best result, ranked by the manifest's `daily_rank`. */
  daily: z.record(z.string(), z.record(z.string(), DailySchema)),
});
export type Plays = z.infer<typeof PlaysSchema>;
export type GameStats = z.infer<typeof GameStatsSchema>;

export const EMPTY_PLAYS: Plays = { version: 1, games: {}, daily: {} };
