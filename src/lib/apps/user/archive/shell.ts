import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, is_file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { archive_name, parent_path } from "$lib/core/utils/zip/create";
import type { ArchiveJob } from "$lib/core/utils/zip/job.svelte";
import { extract_to, free_path, items_at, zip_items, type RunOptions } from "$lib/core/utils/zip/operations";
import { saved_ratio } from "./tree";
import { APP_ID } from "./views";
import { Method } from "$lib/core/utils/zip/format";
import { read_zip } from "$lib/core/utils/zip/read";

const files = () => kernel.service<FilesService>("files");

function fail(command: string, error: unknown): never {
  throw new ShellError(`${command}: ${error instanceof Error ? error.message : String(error)}`);
}

async function stat_file(path: string): Promise<FileValue> {
  const file = await files().get_file(path);
  return file_value(path, "file", file?.size ?? null, file?.lastModified ?? null);
}

function tracked(signal: AbortSignal): RunOptions & { reason: () => string } {
  let job: ArchiveJob | null = null;
  return {
    app_id: APP_ID,
    signal,
    on_job: (next) => (job = next ?? job),
    reason: () => (job as ArchiveJob | null)?.failure ?? "failed",
  };
}

async function paths_from(given: string[], context: CommandContext<unknown>): Promise<string[]> {
  if (given.length > 0 || !context.piped) return given.map((path) => resolve_path(context.session.cwd, path));
  const paths: string[] = [];
  for await (const value of context.input) {
    if (is_file_value(value)) paths.push(value.path);
    else if (typeof value === "string") paths.push(resolve_path(context.session.cwd, value));
  }
  return paths;
}

async function target_for(to: string | undefined, cwd: string, name: string): Promise<string> {
  const path = resolve_path(cwd, to ?? ".");
  if (await files().get_directory(path)) return free_path(path, name);
  if (!(await files().get_directory(parent_path(path)))) throw new ShellError(`zip: ${parent_path(path)}: no such folder`);
  return path;
}

export async function zip(context: CommandContext<{ paths: string[]; to?: string; store: boolean }>): Promise<Tagged> {
  const { args, session, signal, elevated } = context;
  const paths = await paths_from(args.paths, context);
  if (!paths.length) throw new ShellError("zip: nothing to compress");
  const items = await items_at(paths).catch((error) => fail("zip", error));

  const target = await target_for(args.to, session.cwd, archive_name(items));
  assert_writable(parent_path(target), elevated);

  const run = tracked(signal);
  const written = await zip_items(items, target, args.store ? Method.STORE : Method.DEFLATE, run);
  if (written === null) throw new ShellError(`zip: ${run.reason()}`);
  return stat_file(written);
}

export async function unzip({ args, session, signal, elevated }: CommandContext<{ path: string; to?: string }>): Promise<Tagged> {
  const path = resolve_path(session.cwd, args.path);
  const folder = resolve_path(session.cwd, args.to ?? ".");
  if (!(await files().get_directory(folder))) throw new ShellError(`unzip: ${folder}: no such folder`);
  assert_writable(folder, elevated);
  const run = tracked(signal);
  const result = await extract_to(path, folder, run).catch((error) => fail("unzip", error));
  if (result === null) throw new ShellError(`unzip: ${run.reason()}`);
  return file_value(result.path, "directory");
}

export async function* list({ args, session }: CommandContext<{ path: string }>): AsyncGenerator<Tagged> {
  const path = resolve_path(session.cwd, args.path);
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`zip list: ${path}: no such file`);
  const archive = await read_zip(file).catch((error) => fail("zip list", error));
  for (const entry of archive.entries) {
    if (entry.directory) continue;
    yield {
      $type: "zip-entry",
      name: entry.name,
      size: entry.size,
      packed: entry.compressed_size,
      saved: entry.size === 0 ? null : Math.round(saved_ratio(entry.size, entry.compressed_size) * 100),
      archive: path,
    };
  }
}

export function open_archive(path: string): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { path });
}
