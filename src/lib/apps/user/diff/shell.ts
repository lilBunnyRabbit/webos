import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { diff_stat } from "./diff";

const APP_ID = "diff";

async function read(path: string): Promise<string> {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new ShellError(`diff: ${path}: no such file`);
  return file.text();
}

export function open_diff(left: string, right: string): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { left, right });
}

export async function diff({ args, session }: CommandContext<{ left: string; right: string; stat: boolean }>): Promise<Tagged | void> {
  const left = resolve_path(session.cwd, args.left);
  const right = resolve_path(session.cwd, args.right);
  const [a, b] = await Promise.all([read(left), read(right)]);
  if (!args.stat) return open_diff(left, right);
  return { $type: "diff-stat", ...diff_stat(a, b), left, right };
}
