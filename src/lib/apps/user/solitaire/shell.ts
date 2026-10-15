import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { create_storage_handle } from "$lib/core/contexts/app";
import { parse_day } from "$lib/core/games";
import type { Draw } from "./klondike";
import { draw_schema, empty_stats, stats_schema, stats_values } from "./save";

const APP_ID = "solitaire";

const storage = () => create_storage_handle(APP_ID, {});

export function play({ args }: CommandContext<{ draw?: "1" | "3" }>): void {
  const draw: Draw = args.draw ? (Number(args.draw) as Draw) : (storage().get("draw", draw_schema) ?? 1);
  kernel.service<AppsService>("apps").launch(APP_ID, { draw });
}

export function daily({ args }: CommandContext<{ day?: string }>): void {
  const parsed = parse_day(args.day ?? "today");
  if (!parsed.ok) throw new ShellError(parsed.error);
  kernel.service<AppsService>("apps").launch(APP_ID, { daily: parsed.day });
}

export function* stats(): Generator<Tagged> {
  yield* stats_values(storage().get("stats", stats_schema) ?? empty_stats());
}
