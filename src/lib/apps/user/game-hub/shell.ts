import kernel, { type AppsService } from "$lib/core/api";
import { live_file } from "$lib/core/contexts/app";
import type { Tagged, Value } from "$lib/core/api/services/shell/type";
import { EMPTY_PLAYS, PLAYS_PATH, PlaysSchema, type Plays } from "$kit/games";
import { day_key } from "$lib/core/utils/date";
import {
  daily_value,
  entries,
  format_duration,
  game_value,
  list_games,
  Sort,
  sort_entries,
  streak,
  supports_daily,
  totals,
} from "./hub";

const apps = () => kernel.service<AppsService>("apps");

const plays_file = live_file<Plays>(PLAYS_PATH, EMPTY_PLAYS, PlaysSchema);
const read_plays = () => plays_file.read();

const games = () => list_games([...apps().list()].map(([, manifest]) => manifest));

export async function* library(): AsyncGenerator<Tagged> {
  const plays = await read_plays();
  for (const entry of sort_entries(entries(games(), plays), Sort.RECENT)) yield game_value(entry);
}

const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

export async function* daily(): AsyncGenerator<Tagged | string> {
  const plays = await read_plays();
  const today = day_key();
  const dailies = games()
    .filter((game) => supports_daily(game.props))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const game of dailies) yield daily_value(game, plays, today);
  yield `streak: ${days(streak(plays, today))}`;
}

export async function stats(): Promise<Value> {
  const plays = await read_plays();
  const total = totals(plays);
  return {
    time: format_duration(total.ms),
    sessions: total.sessions,
    played: `${total.played} of ${games().length}`,
    dailies: total.dailies,
    streak: days(streak(plays, day_key())),
  };
}

export function launch(id: string, props?: Record<string, string>): void {
  apps().launch(id, props);
}
