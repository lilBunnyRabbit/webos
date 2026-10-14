import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import type { Tagged, Value } from "$lib/core/api/services/shell/type";
import { day_key, EMPTY_PLAYS, PLAYS_PATH, PlaysSchema, type Plays } from "$lib/core/games";
import { daily_value, entries, format_duration, game_value, list_games, Sort, sort_entries, streak, supports_daily, totals } from "./hub";

const apps = () => kernel.service<AppsService>("apps");

async function read_plays(): Promise<Plays> {
  const file = await kernel.service<FilesService>("files").get_file(PLAYS_PATH);
  if (!file) return EMPTY_PLAYS;
  try {
    const parsed = PlaysSchema.safeParse(JSON.parse(await file.text()));
    return parsed.success ? parsed.data : EMPTY_PLAYS;
  } catch {
    return EMPTY_PLAYS;
  }
}

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
