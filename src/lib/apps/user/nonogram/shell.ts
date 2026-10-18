import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { ShellError, type CommandContext } from "$lib/core/api/services/shell/type";
import { parse_day } from "$kit/games";
import { analyze_off_thread } from "./analysis";
import { parse_nonogram, VERDICT_TEXT } from "./file";
import { Mode, type Size } from "./game";

const APP_ID = "nonogram";
const CHECK_MS = 3000;

const launch = (props: Record<string, unknown>) => kernel.service<AppsService>("apps").launch(APP_ID, props);

export function new_puzzle({ args }: CommandContext<{ size?: Size; colour: boolean }>): void {
  launch({ ...(args.size ? { size: args.size } : {}), mode: args.colour ? Mode.COLOR : Mode.BW });
}

export function daily({ args }: CommandContext<{ day?: string }>): void {
  const parsed = parse_day(args.day ?? "today");
  if (!parsed.ok) throw new ShellError(parsed.error);
  launch({ daily: parsed.day });
}

async function exists(path: string) {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new ShellError(`no such file: ${path}`);
  return file;
}

export async function edit({ args, session }: CommandContext<{ path?: string }>): Promise<void> {
  if (!args.path) {
    launch({ edit: true });
    return;
  }
  const path = resolve_path(session.cwd, args.path);
  await exists(path);
  launch({ path, edit: true });
}

export async function check({ args, session, signal }: CommandContext<{ path: string }>): Promise<string> {
  const path = resolve_path(session.cwd, args.path);
  const parsed = parse_nonogram(await (await exists(path)).text());
  if (!parsed.ok) throw new ShellError(`${args.path}: ${parsed.error}`);
  const { width, height, palette, cells } = parsed.drawing;
  const job = analyze_off_thread({ width, height, palette, cells, budget: 20_000, time_ms: CHECK_MS });
  signal.addEventListener("abort", () => job.cancel(), { once: true });
  const { verdict } = await job.result;
  return VERDICT_TEXT[verdict];
}
