import { describe, expect, it } from "vitest";
import { MoveKind } from "./klondike";
import { empty_stats, record_played, record_win, save_file_schema, stats_values, to_saved } from "./save";

describe("stats", () => {
  it("counts per draw mode and keeps the best time and score", () => {
    let stats = record_played(empty_stats(), 3);
    stats = record_win(stats, 3, 90_000, 4000);
    stats = record_win(stats, 3, 120_000, 5000);
    expect(stats.draw3).toEqual({ played: 1, won: 2, best_ms: 90_000, best_score: 5000 });
    expect(stats.draw1.played).toBe(0);
  });

  it("lists one shell value per draw mode", () => {
    const stats = record_win(record_played(empty_stats(), 3), 3, 90_000, 4000);
    expect(stats_values(stats)).toEqual([
      { $type: "solitaire-stats", mode: "draw 1", played: 0, won: 0, best_time: null, best_score: null },
      { $type: "solitaire-stats", mode: "draw 3", played: 1, won: 1, best_time: 90_000, best_score: 4000 },
    ]);
  });
});

describe("save file", () => {
  it("round-trips a game and rejects a broken move", () => {
    const game = to_saved(9, 1, [{ kind: MoveKind.DRAW }, { kind: MoveKind.MOVE, from: "w", to: "t3", count: 1 }], 1234.5, true, false);
    expect(save_file_schema.parse({ version: 1, day: null, game })).toEqual({ version: 1, day: null, game: { ...game, elapsed: 1235 } });
    const broken = { ...game, moves: [{ kind: MoveKind.MOVE, from: "x9", to: "t3", count: 1 }] };
    expect(save_file_schema.safeParse({ version: 1, day: null, game: broken }).success).toBe(false);
  });
});
