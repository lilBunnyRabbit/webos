import { DailyRank, type DailyRanks } from "$lib/core/api/services/apps/type";

export { DailyRank, type DailyRanks };

export interface DailyResult {
  ms: number;
  score?: number;
}

/** Ranked by score, a scored result beats an unscored one: results saved before scores existed have none. */
export function better_daily(best: DailyResult, next: DailyResult, rank: DailyRank = DailyRank.TIME): DailyResult {
  if (rank !== DailyRank.TIME && best.score !== next.score) {
    if (best.score === undefined || next.score === undefined) return next.score === undefined ? best : next;
    return (rank === DailyRank.SCORE_ASC) === next.score < best.score ? next : best;
  }
  return next.ms < best.ms ? next : best;
}

/** Where a daily result sits in a day of `plays.json`: the app id, or `{app_id}/{mode}` for one mode's daily (ADR-050). */
export function daily_key(app_id: string, mode?: string): string {
  return mode ? `${app_id}/${mode}` : app_id;
}

export function split_daily_key(key: string): { app_id: string; mode: string | null } {
  const at = key.indexOf("/");
  return at === -1 ? { app_id: key, mode: null } : { app_id: key.slice(0, at), mode: key.slice(at + 1) };
}

/** The rank one daily uses: a per-mode record gives that mode's, a mode it doesn't list ranks by time. */
export function daily_rank_for(rank: DailyRank | DailyRanks | undefined, mode?: string): DailyRank | undefined {
  if (typeof rank !== "object") return rank;
  return mode === undefined ? undefined : rank[mode];
}
