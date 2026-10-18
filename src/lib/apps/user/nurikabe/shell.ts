import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type CommandContext } from "$lib/core/api/services/shell/type";
import { parse_day } from "$kit/games";

const APP_ID = "nurikabe";

export function daily({ args }: CommandContext<{ day?: string }>): void {
  const parsed = parse_day(args.day ?? "today");
  if (!parsed.ok) throw new ShellError(parsed.error);
  kernel.service<AppsService>("apps").launch(APP_ID, { daily: parsed.day });
}
