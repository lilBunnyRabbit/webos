import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { base_name, parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, is_file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import { ShellError, type CommandContext, type Completion, type ShellSession, type ShellService, type Tagged } from "$lib/core/api/services/shell/type";
import { error_message } from "$lib/core/utils";
import { APP_ID, child_path, is_inspectable_name, strip_beside } from "./files";
import { coordinates } from "./groups";
import { inspect } from "./inspect";
import { stripped_name } from "./strip";

const files = () => kernel.service<FilesService>("files");

async function paths_from(given: string[], context: CommandContext<unknown>): Promise<string[]> {
  if (given.length > 0 || !context.piped) return given.map((path) => resolve_path(context.session.cwd, path));
  const paths: string[] = [];
  for await (const value of context.input) {
    if (is_file_value(value)) paths.push(value.path);
    else if (typeof value === "string") paths.push(resolve_path(context.session.cwd, value));
  }
  return paths;
}

export async function* meta(context: CommandContext<{ paths: string[] }>): AsyncGenerator<Tagged> {
  const paths = await paths_from(context.args.paths, context);
  if (paths.length === 0) throw new ShellError("meta: give at least one file");
  for (const path of paths) {
    if (context.signal.aborted) return;
    const file = await files().get_file(path);
    if (!file) throw new ShellError(`meta: ${path}: no such file`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const found = await inspect(bytes, file.name).catch((error: unknown) => {
      throw new ShellError(`meta: ${path}: ${error_message(error)}`);
    });
    yield {
      $type: "meta",
      name: base_name(path),
      path,
      format: found.format,
      camera: found.camera,
      date: found.date,
      gps: found.gps && coordinates(found.gps),
      size: file.size,
    };
  }
}

export async function strip(context: CommandContext<{ paths: string[]; keep_orientation: boolean }>): Promise<FileValue[]> {
  const paths = await paths_from(context.args.paths, context);
  if (paths.length === 0) throw new ShellError("meta strip: give at least one image");
  const out: FileValue[] = [];
  for (const path of paths) {
    assert_writable(child_path(parent_path(path), stripped_name(base_name(path))), context.elevated);
    const result = await strip_beside(path, context.args.keep_orientation).catch((error: unknown) => {
      throw new ShellError(`meta strip: ${path}: ${error_message(error)}`);
    });
    const file = await files().get_file(result.path);
    out.push(file_value(result.path, "file", file?.size ?? null, file?.lastModified ?? null));
  }
  return out;
}

export function open(path: string): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { path });
}

export async function complete_files(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || is_inspectable_name(item.value));
}
