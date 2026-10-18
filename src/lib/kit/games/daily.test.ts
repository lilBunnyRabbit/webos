import { describe, expect, it } from "vitest";
import { better_daily, daily_key, daily_rank_for, DailyRank, split_daily_key } from "./daily";

describe("better_daily", () => {
  it("keeps the faster time by default and ignores the score", () => {
    expect(better_daily({ ms: 5000, score: 1 }, { ms: 4000, score: 9 })).toEqual({ ms: 4000, score: 9 });
    expect(better_daily({ ms: 4000 }, { ms: 5000 }, DailyRank.TIME)).toEqual({ ms: 4000 });
  });

  it("ranks by the lower score, then the faster time", () => {
    expect(better_daily({ ms: 1000, score: 6 }, { ms: 9000, score: 4 }, DailyRank.SCORE_ASC)).toEqual({ ms: 9000, score: 4 });
    expect(better_daily({ ms: 1000, score: 4 }, { ms: 500, score: 6 }, DailyRank.SCORE_ASC)).toEqual({ ms: 1000, score: 4 });
    expect(better_daily({ ms: 3000, score: 4 }, { ms: 2000, score: 4 }, DailyRank.SCORE_ASC)).toEqual({ ms: 2000, score: 4 });
  });

  it("ranks by the higher score, then the faster time", () => {
    expect(better_daily({ ms: 1000, score: 6 }, { ms: 9000, score: 8 }, DailyRank.SCORE_DESC)).toEqual({ ms: 9000, score: 8 });
    expect(better_daily({ ms: 1000, score: 8 }, { ms: 500, score: 6 }, DailyRank.SCORE_DESC)).toEqual({ ms: 1000, score: 8 });
    expect(better_daily({ ms: 3000, score: 8 }, { ms: 4000, score: 8 }, DailyRank.SCORE_DESC)).toEqual({ ms: 3000, score: 8 });
  });

  it("prefers a scored result over an old unscored one", () => {
    expect(better_daily({ ms: 1000 }, { ms: 9000, score: 7 }, DailyRank.SCORE_ASC)).toEqual({ ms: 9000, score: 7 });
    expect(better_daily({ ms: 9000, score: 7 }, { ms: 1000 }, DailyRank.SCORE_DESC)).toEqual({ ms: 9000, score: 7 });
  });
});

describe("per-mode dailies", () => {
  it("keys a mode under its app", () => {
    expect(daily_key("sudoku")).toBe("sudoku");
    expect(daily_key("color-games", "recall")).toBe("color-games/recall");
  });

  it("splits a key back", () => {
    expect(split_daily_key("sudoku")).toEqual({ app_id: "sudoku", mode: null });
    expect(split_daily_key("color-games/hex-guess")).toEqual({ app_id: "color-games", mode: "hex-guess" });
  });

  it("picks the mode's rank from a record, time for an unlisted mode", () => {
    const ranks = { recall: DailyRank.SCORE_DESC, sort: DailyRank.TIME };
    expect(daily_rank_for(ranks, "recall")).toBe(DailyRank.SCORE_DESC);
    expect(daily_rank_for(ranks, "other")).toBeUndefined();
    expect(daily_rank_for(ranks)).toBeUndefined();
    expect(daily_rank_for(DailyRank.SCORE_ASC, "recall")).toBe(DailyRank.SCORE_ASC);
    expect(daily_rank_for(undefined)).toBeUndefined();
  });
});
