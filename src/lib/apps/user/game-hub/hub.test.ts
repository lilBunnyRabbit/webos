import type { Plays } from "$lib/core/games";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { daily_value, entries, format_duration, format_last_played, game_value, highlight_dailies, Sort, sort_entries, streak, supports_daily, totals } from "./hub";

const EMPTY_PLAYS: Plays = { version: 1, games: {}, daily: {} };
const plays = (patch: Partial<Plays>): Plays => ({ ...EMPTY_PLAYS, ...patch });

describe("supports_daily", () => {
  it("finds a daily key in an object schema", () => {
    expect(supports_daily(z.object({ daily: z.string().optional() }))).toBe(true);
    expect(supports_daily(z.object({ path: z.string() }))).toBe(false);
    expect(supports_daily(undefined)).toBe(false);
    expect(supports_daily(z.string())).toBe(false);
  });
});

describe("sort_entries", () => {
  const data = plays({
    games: {
      b: { ms: 5_000, sessions: 1, last: "2026-10-14T10:00:00.000Z" },
      c: { ms: 90_000, sessions: 4, last: "2026-10-12T10:00:00.000Z" },
    },
  });
  const games = [
    { id: "a", name: "Alpha" },
    { id: "c", name: "Charlie" },
    { id: "b", name: "Bravo" },
    { id: "d", name: "Delta" },
  ];
  const ids = (sort: Sort) => sort_entries(entries(games, data), sort).map((entry) => entry.game.id);

  it("sorts by name", () => expect(ids(Sort.NAME)).toEqual(["a", "b", "c", "d"]));
  it("sorts by last played, unplayed last A–Z", () => expect(ids(Sort.RECENT)).toEqual(["b", "c", "a", "d"]));
  it("sorts by play time, unplayed last A–Z", () => expect(ids(Sort.MOST_PLAYED)).toEqual(["c", "b", "a", "d"]));
});

describe("streak", () => {
  const solved = { sudoku: { ms: 1000 } };
  it("is zero with nothing solved", () => expect(streak(EMPTY_PLAYS, "2026-10-14")).toBe(0));
  it("counts back from yesterday until today is solved", () => {
    const data = plays({ daily: { "2026-10-12": solved, "2026-10-13": solved } });
    expect(streak(data, "2026-10-14")).toBe(2);
    expect(streak(plays({ daily: { ...data.daily, "2026-10-14": solved } }), "2026-10-14")).toBe(3);
  });
  it("stops at a gap", () => {
    expect(streak(plays({ daily: { "2026-10-11": solved, "2026-10-13": solved } }), "2026-10-14")).toBe(1);
  });
  it("crosses a year end", () => {
    expect(streak(plays({ daily: { "2025-12-31": solved, "2026-01-01": solved } }), "2026-01-01")).toBe(2);
  });
  it("ignores an empty day", () => expect(streak(plays({ daily: { "2026-10-14": {} } }), "2026-10-14")).toBe(0));
});

describe("totals", () => {
  it("adds time, sessions and dailies", () => {
    const data = plays({
      games: { a: { ms: 1000, sessions: 2, last: "" }, b: { ms: 500, sessions: 1, last: "" } },
      daily: { "2026-10-13": { a: { ms: 1 } }, "2026-10-14": { a: { ms: 1 }, b: { ms: 2 } } },
    });
    expect(totals(data)).toEqual({ ms: 1500, sessions: 3, played: 2, dailies: 3 });
  });
});

describe("format_duration", () => {
  it("scales from seconds to hours", () => {
    expect(format_duration(0)).toBe("0s");
    expect(format_duration(45_000)).toBe("45s");
    expect(format_duration(12 * 60_000)).toBe("12m");
    expect(format_duration(3 * 3_600_000)).toBe("3h");
    expect(format_duration(3 * 3_600_000 + 20 * 60_000)).toBe("3h 20m");
  });
});

describe("format_last_played", () => {
  const now = new Date(2026, 9, 14, 12);
  it("says today, yesterday, days ago", () => {
    expect(format_last_played(new Date(2026, 9, 14, 1).toISOString(), now)).toBe("Today");
    expect(format_last_played(new Date(2026, 9, 13, 23).toISOString(), now)).toBe("Yesterday");
    expect(format_last_played(new Date(2026, 9, 10).toISOString(), now)).toBe("4 days ago");
  });
  it("is empty for a bad date", () => expect(format_last_played("", now)).toBe(""));
});

describe("highlight_dailies", () => {
  const game = (id: string, name = id) => ({ id, name });
  it("puts unsolved first, then recently played, then A–Z, and caps the count", () => {
    const plays = {
      version: 1 as const,
      games: { b: { ms: 1, sessions: 1, last: "2026-10-13T10:00:00.000Z" }, c: { ms: 1, sessions: 1, last: "2026-10-14T10:00:00.000Z" } },
      daily: { "2026-10-14": { c: { ms: 5 } } },
    };
    const list = [game("a"), game("b"), game("c"), game("d")];
    expect(highlight_dailies(list, plays, "2026-10-14").map((g) => g.id)).toEqual(["b", "a", "d"]);
    expect(highlight_dailies(list, plays, "2026-10-14", 4).map((g) => g.id)).toEqual(["b", "a", "d", "c"]);
  });
});

describe("shell values", () => {
  const data = plays({
    games: { a: { ms: 90_000, sessions: 3, last: "2026-10-14T10:00:00.000Z" } },
    daily: { "2026-10-14": { a: { ms: 61_000 } } },
  });
  const alpha = { id: "a", name: "Alpha" };
  const bravo = { id: "b", name: "Bravo" };

  it("keeps time and last as numbers", () => {
    expect(game_value({ game: alpha, stats: data.games.a })).toEqual({
      $type: "game",
      id: "a",
      name: "Alpha",
      time: 90_000,
      sessions: 3,
      last: Date.parse("2026-10-14T10:00:00.000Z"),
    });
    expect(game_value({ game: bravo, stats: null })).toMatchObject({ time: 0, sessions: 0, last: null });
  });

  it("marks a daily solved with its best time", () => {
    expect(daily_value(alpha, data, "2026-10-14")).toEqual({ $type: "game-daily", id: "a", name: "Alpha", day: "2026-10-14", solved: true, time: 61_000 });
    expect(daily_value(bravo, data, "2026-10-14")).toMatchObject({ solved: false, time: null });
  });
});
