import kernel, { type AppsService } from "$lib/core/api";
import { json_file, type JsonFile } from "$lib/core/contexts/app/json-file.svelte";
import { z } from "zod";
import { better_daily, type DailyResult } from "./daily";

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

// Flushed this often while playing, so closing the tab loses at most this much.
const FLUSH_MS = 30_000;

/** Every game's play time and daily results, for Game Hub. Call during component init. */
export function use_plays(): Omit<JsonFile<Plays>, "release"> {
  const plays = json_file(PLAYS_PATH, EMPTY_PLAYS, PlaysSchema);
  $effect(() => () => plays.release());
  return plays;
}

export interface PlayTracker {
  /** Records a solved daily puzzle; keeps the better result by the manifest's `daily_rank`. */
  daily(day: string, ms: number, score?: number): void;
}

/**
 * Counts the time this game is visible into `/var/lib/games/plays.json` (ADR-035). Call during component init, as
 * `track_play(app_id, () => win.is_visible)`.
 */
export function track_play(app_id: string, visible: () => boolean): PlayTracker {
  const plays = json_file(PLAYS_PATH, EMPTY_PLAYS, PlaysSchema);
  let pending_ms = $state(0);
  let pending_session = $state(false);
  let pending_daily = $state<(DailyResult & { day: string })[]>([]);
  let since: number | null = null;

  const fold = () => {
    if (since === null) return;
    const now = Date.now();
    pending_ms += now - since;
    since = now;
  };

  $effect(() => {
    if (!visible()) return;
    since = Date.now();
    pending_session = true;
    const timer = setInterval(fold, FLUSH_MS);
    return () => {
      clearInterval(timer);
      fold();
      since = null;
    };
  });

  $effect(() => {
    if (!plays.ready || (pending_ms < 1000 && pending_daily.length === 0)) return;
    const data = plays.value;
    const stats = data.games[app_id] ?? { ms: 0, sessions: 0, last: "" };
    data.games[app_id] = {
      ms: stats.ms + Math.round(pending_ms),
      sessions: stats.sessions,
      last: new Date().toISOString(),
    };
    const rank = kernel.service<AppsService>("apps").get(app_id)?.daily_rank;
    for (const { day, ...result } of pending_daily) {
      const best = data.daily[day]?.[app_id];
      data.daily[day] = { ...data.daily[day], [app_id]: best ? better_daily(best, result, rank) : result };
    }
    pending_ms = 0;
    pending_daily = [];
  });

  let counted_session = false;
  $effect(() => {
    if (!plays.ready || !pending_session || counted_session) return;
    counted_session = true;
    const stats = plays.value.games[app_id];
    plays.value.games[app_id] = { ms: stats?.ms ?? 0, sessions: (stats?.sessions ?? 0) + 1, last: new Date().toISOString() };
  });

  $effect(() => () => {
    fold();
    since = null;
    if (plays.ready && pending_ms >= 1000) {
      const stats = plays.value.games[app_id];
      if (stats) stats.ms += Math.round(pending_ms);
    }
    plays.release();
  });

  return {
    daily(day, ms, score) {
      pending_daily = [...pending_daily, score === undefined ? { day, ms } : { day, ms, score }];
    },
  };
}
