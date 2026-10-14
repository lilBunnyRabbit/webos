import type { GameStats, Plays } from "$lib/core/games";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { z, type ZodType } from "zod";

export const HUB_ID = "game-hub";

export const Tab = { LIBRARY: "library", TODAY: "today", STATS: "stats" } as const;
export type Tab = (typeof Tab)[keyof typeof Tab];

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

export function format_duration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes === 0) return `${Math.floor(Math.max(0, ms) / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

export function format_last_played(iso: string, now = new Date()): string {
  const then = new Date(iso);
  if (!iso || Number.isNaN(then.getTime())) return "";
  const midnight = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((midnight(now) - midnight(then)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: then.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}
