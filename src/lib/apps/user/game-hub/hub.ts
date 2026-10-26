import type { GameStats, Plays } from "$kit/games";
import { daily_key, type DailyRank, type DailyRanks } from "$kit/games/daily";
import type { Tagged } from "$lib/core/api/services/shell/type";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z, type ZodType } from "zod";
import { format_duration, format_last_played, HUB_ID, Tab } from "./labels";

export { format_duration, format_last_played, HUB_ID, Tab };

export const Sort = { RECENT: "recent", NAME: "name", MOST_PLAYED: "most-played" } as const;
export type Sort = (typeof Sort)[keyof typeof Sort];

export const SORT_OPTIONS: { value: Sort; label: string }[] = [
  { value: Sort.RECENT, label: "Recent" },
  { value: Sort.NAME, label: "A–Z" },
  { value: Sort.MOST_PLAYED, label: "Most played" },
];

export interface GameInfo {
  id: string;
  name: string;
}

export interface GameEntry<T extends GameInfo = GameInfo> {
  game: T;
  stats: GameStats | null;
}

/** Daily-puzzle contract: a game offers one when its launch props schema has a `daily` key. */
export function supports_daily(schema: ZodType | undefined): boolean {
  return schema instanceof z.ZodObject && "daily" in schema.shape;
}

export interface DailyGame<T extends GameInfo = GameInfo> {
  key: string;
  game: T;
  mode: string | null;
  name: string;
  short: string;
}

export function mode_label(mode: string): string {
  const words = mode.replaceAll("-", " ").replace(/(\d)x(\d)/g, "$1×$2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One row per daily: a game with a per-mode `daily_rank` gets one per mode, in the record's order (ADR-050). */
export function daily_games<T extends GameInfo & { daily?: boolean; props?: ZodType; daily_rank?: DailyRank | DailyRanks }>(games: T[]): DailyGame<T>[] {
  return games
    .filter((game) => game.daily ?? supports_daily(game.props))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((game): DailyGame<T>[] => {
      if (typeof game.daily_rank !== "object") return [{ key: game.id, game, mode: null, name: game.name, short: game.name }];
      return Object.keys(game.daily_rank).map((mode) => ({
        key: daily_key(game.id, mode),
        game,
        mode,
        name: `${game.name} · ${mode_label(mode)}`,
        short: mode_label(mode),
      }));
    });
}

export function daily_props(entry: DailyGame, day: string): Record<string, string> {
  return entry.mode ? { daily: day, mode: entry.mode } : { daily: day };
}

export function list_games<T extends GameInfo & { category: string }>(apps: Iterable<T>): T[] {
  return [...apps].filter((app) => app.category === AppCategory.GAMES && app.id !== HUB_ID);
}

export function entries<T extends GameInfo>(games: T[], plays: Plays): GameEntry<T>[] {
  return games.map((game) => ({ game, stats: plays.games[game.id] ?? null }));
}

const by_name = (a: GameEntry, b: GameEntry) => a.game.name.localeCompare(b.game.name);

/** Recent and most played put never-played games last, A–Z among themselves. */
export function sort_entries<T extends GameEntry>(list: T[], sort: Sort): T[] {
  const sorted = [...list];
  if (sort === Sort.NAME) return sorted.sort(by_name);
  const key = (entry: GameEntry) => (sort === Sort.RECENT ? (entry.stats?.last ?? "") : (entry.stats?.ms ?? -1));
  return sorted.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === kb) return by_name(a, b);
    return ka < kb ? 1 : -1;
  });
}

function previous_day(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const previous = new Date(year, month - 1, date - 1);
  return `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, "0")}-${String(previous.getDate()).padStart(2, "0")}`;
}

const solved_on = (plays: Plays, day: string) => Object.keys(plays.daily[day] ?? {}).length > 0;

/** Consecutive days with a solved daily, ending today when today is solved, otherwise yesterday. */
export function streak(plays: Plays, today: string): number {
  let day = solved_on(plays, today) ? today : previous_day(today);
  let count = 0;
  while (solved_on(plays, day)) {
    count++;
    day = previous_day(day);
  }
  return count;
}

export interface Totals {
  ms: number;
  sessions: number;
  played: number;
  dailies: number;
}

export function totals(plays: Plays): Totals {
  const games = Object.values(plays.games);
  return {
    ms: games.reduce((sum, stats) => sum + stats.ms, 0),
    sessions: games.reduce((sum, stats) => sum + stats.sessions, 0),
    played: games.filter((stats) => stats.sessions > 0 || stats.ms > 0).length,
    dailies: Object.values(plays.daily).reduce((sum, day) => sum + Object.keys(day).length, 0),
  };
}

/** The few dailies a small view shows: unsolved first, recently played first, then A–Z. */
export function highlight_dailies<T extends DailyGame>(dailies: T[], plays: Plays, today: string, max = 3): T[] {
  const solved = plays.daily[today] ?? {};
  const last = (entry: T) => plays.games[entry.game.id]?.last ?? "";
  return [...dailies]
    .sort((a, b) => Number(a.key in solved) - Number(b.key in solved) || last(b).localeCompare(last(a)) || a.name.localeCompare(b.name))
    .slice(0, max);
}

/** Times stay numbers so `sort` and `where` work; the manifest formats the cells. */
export function game_value({ game, stats }: GameEntry): Tagged {
  const last = stats?.last ? Date.parse(stats.last) : NaN;
  return {
    $type: "game",
    id: game.id,
    name: game.name,
    time: stats?.ms ?? 0,
    sessions: stats?.sessions ?? 0,
    last: Number.isNaN(last) ? null : last,
  };
}

export function daily_value(entry: DailyGame, plays: Plays, day: string): Tagged {
  const result = plays.daily[day]?.[entry.key];
  return {
    $type: "game-daily",
    id: entry.game.id,
    mode: entry.mode,
    name: entry.name,
    day,
    solved: result !== undefined,
    time: result?.ms ?? null,
    score: result?.score ?? null,
  };
}
