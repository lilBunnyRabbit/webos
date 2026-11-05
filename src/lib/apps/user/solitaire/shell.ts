import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { app_data_path, live_file } from "$lib/core/contexts/app";
import { parse_day } from "$kit/games";
import type { Draw } from "./klondike";
import { empty_storage, STORAGE_FILE, storage_schema, stats_values } from "./save";

const APP_ID = "solitaire";

const stored = () => live_file(app_data_path(APP_ID, STORAGE_FILE), empty_storage(), storage_schema).read();

export async function play({ args }: CommandContext<{ draw?: "1" | "3" }>): Promise<void> {
  const draw: Draw = args.draw ? (Number(args.draw) as Draw) : (await stored()).draw;
  kernel.service<AppsService>("apps").launch(APP_ID, { draw });
}

export function daily({ args }: CommandContext<{ day?: string }>): void {
  const parsed = parse_day(args.day ?? "today");
  if (!parsed.ok) throw new ShellError(parsed.error);
  kernel.service<AppsService>("apps").launch(APP_ID, { daily: parsed.day });
}

export async function* stats(): AsyncGenerator<Tagged> {
  yield* stats_values((await stored()).stats);
}
