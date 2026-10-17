import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { APP_ID, dump_blob } from "./hex";

export async function* hexdump({ args, session, signal }: CommandContext<{ path: string; length: number; offset: number }>): AsyncGenerator<Tagged> {
  const path = resolve_path(session.cwd, args.path);
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new ShellError(`hexdump: ${path}: no such file`);
  yield* dump_blob(file, path, args.offset, args.length, signal);
}

export function open_at(path: string, offset: number): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { path, offset });
}
