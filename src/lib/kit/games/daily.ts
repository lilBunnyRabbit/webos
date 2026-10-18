/** Time always breaks a tie. */
export const DailyRank = { TIME: "time", SCORE_ASC: "score-asc", SCORE_DESC: "score-desc" } as const;
export type DailyRank = (typeof DailyRank)[keyof typeof DailyRank];

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
