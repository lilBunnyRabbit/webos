import { describe, expect, it } from "vitest";
import { better_daily, DailyRank } from "./daily";

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
