import kernel, { type AppsService } from "$lib/core/api";
import { live_file } from "$lib/core/contexts/app";
import type { Tagged, Value } from "$lib/core/api/services/shell/type";
import { EMPTY_PLAYS, PLAYS_PATH, PlaysSchema, type Plays } from "$kit/games";
import { day_key } from "$lib/core/utils/date";
import {
  daily_games,
  daily_value,
  entries,
  format_duration,
  game_value,
  list_games,
  Sort,
  sort_entries,
  streak,
  totals,
} from "./hub";

const apps = () => kernel.service<AppsService>("apps");

const plays_file = live_file<Plays>(PLAYS_PATH, EMPTY_PLAYS, PlaysSchema);
const read_plays = () => plays_file.read();

async function games() {
  await apps().catalogue();
  return list_games(apps().listings());
}

export async function* library(): AsyncGenerator<Tagged> {
  const plays = await read_plays();
  for (const entry of sort_entries(entries(await games(), plays), Sort.RECENT)) yield game_value(entry);
}

const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

export async function* daily(): AsyncGenerator<Tagged | string> {
  const plays = await read_plays();
  const today = day_key();
  for (const entry of daily_games(await games())) yield daily_value(entry, plays, today);
  yield `streak: ${days(streak(plays, today))}`;
}

export async function stats(): Promise<Value> {
  const plays = await read_plays();
  const total = totals(plays);
  return {
    time: format_duration(total.ms),
    sessions: total.sessions,
    played: `${total.played} of ${(await games()).length}`,
    dailies: total.dailies,
    streak: days(streak(plays, day_key())),
  };
}

export function launch(id: string, props?: Record<string, string>): void {
  apps().launch(id, props);
}
