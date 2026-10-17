import { format_bytes } from "$lib/core/utils";
import { ShellError, type CommandContext, type Completion, type ShellSession } from "../shell/type";
import { is_locked_path, mount_point_of, PATHS } from "./hierarchy";
import { join_path, resolve_path, split_path } from "./path";
import { assert_writable, file_value, is_file_value, type FileValue } from "./shell";
import type { FilesService } from "./type";

/** Text files print, anything with a NUL in its first 8 KB is binary. Bigger than this prints as a file value. */
const CAT_LIMIT = 1024 * 1024;

const parent_of = (path: string) => join_path(split_path(path).slice(0, -1));
const name_of = (path: string) => split_path(path).at(-1) ?? "";

/** A new entry right in /mnt would be hidden behind the mount table: mounts come from `mount`. */
function assert_creatable(path: string, elevated: boolean): void {
  assert_writable(parent_of(path) === PATHS.mnt ? PATHS.mnt : path, elevated);
}

function assert_removable(path: string, elevated: boolean): void {
  if (path === "/") throw new ShellError("refusing to touch /");
  if (!elevated && is_locked_path(path)) throw new ShellError(`${path}: belongs to the system. Use sudo to change it`);
}

/** Paths from the args, or else from the values piped in (file values or text). */
async function paths_from(given: string[], context: CommandContext<unknown>): Promise<string[]> {
  if (given.length > 0 || !context.piped) return given.map((path) => resolve_path(context.session.cwd, path));
  const paths: string[] = [];
  for await (const value of context.input) {
    if (is_file_value(value)) paths.push(value.path);
    else if (typeof value === "string") paths.push(resolve_path(context.session.cwd, value));
  }
  return paths;
}

async function stat(files: FilesService, path: string): Promise<FileValue | null> {
  if (path === "/") return file_value("/", "directory");
  if (await files.get_directory(path)) return file_value(path, "directory");
  const file = await files.get_file(path);
  return file ? file_value(path, "file", file.size, file.lastModified) : null;
}

async function require_stat(files: FilesService, path: string): Promise<FileValue> {
  const found = await stat(files, path);
  if (!found) throw new ShellError(`${path}: no such file or folder`);
  return found;
}

async function require_directory(files: FilesService, path: string): Promise<FileSystemDirectoryHandle> {
  const directory = await files.get_directory(path);
  if (!directory) throw new ShellError(`${path}: no such folder`);
  return directory;
}

export async function complete_path(
  files: FilesService,
  partial: string,
  { session }: { session: ShellSession }
): Promise<Completion[]> {
  if (partial === "~") return [{ value: "~/", final: false }];
  const slash = partial.lastIndexOf("/");
  const typed_dir = slash === -1 ? "" : partial.slice(0, slash + 1);
  const directory = await files.get_directory(resolve_path(session.cwd, typed_dir || "."));
  if (!directory) return [];
  const items = await files.list(directory, { include_metadata: true });
  return items.map((item) =>
    item.kind === "directory"
      ? { value: `${typed_dir}${item.name}/`, detail: "folder", final: false }
      : { value: `${typed_dir}${item.name}`, detail: item.size === undefined ? undefined : format_bytes(item.size) }
  );
}

export async function* ls(files: FilesService, { args, session }: CommandContext<{ path?: string }>) {
  const path = resolve_path(session.cwd, args.path ?? ".");
  const directory = await files.get_directory(path);
  if (!directory) {
    yield await require_stat(files, path);
    return;
  }
  for (const item of await files.list(directory, { include_metadata: true })) {
    const child = join_path(split_path(path), item.name);
    yield item.kind === "directory"
      ? file_value(child, "directory")
      : file_value(child, "file", item.size ?? null, item.last_modified ?? null);
  }
}

export async function cd(files: FilesService, { args, session }: CommandContext<{ path: string }>) {
  const path = resolve_path(session.cwd, args.path);
  await require_directory(files, path);
  session.cwd = path;
}

export async function* cat(files: FilesService, context: CommandContext<{ paths: string[] }>) {
  for (const path of await paths_from(context.args.paths, context)) {
    const file = await files.get_file(path);
    if (!file) throw new ShellError(`${path}: no such file`);
    const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
    if (file.size > CAT_LIMIT || head.includes(0)) yield file_value(path, "file", file.size, file.lastModified);
    else yield await file.text();
  }
}

export async function transfer(
  files: FilesService,
  mode: "copy" | "move",
  context: CommandContext<{ from: string[]; to: string; recursive?: boolean }>
) {
  const { args, session, elevated } = context;
  const sources = await paths_from(args.from, context);
  if (sources.length === 0) throw new ShellError(`${mode === "copy" ? "cp" : "mv"}: nothing to ${mode}`);
  const target = resolve_path(session.cwd, args.to);
  const target_dir = await files.get_directory(target);

  for (const source of sources) {
    const found = await require_stat(files, source);
    if (mode === "copy" && found.kind === "directory" && !args.recursive)
      throw new ShellError(`cp: ${source} is a folder (use -r)`);
    if (mode === "move") assert_removable(source, elevated);
  }

  // One source onto a name that isn't a folder: copy or move it under that name.
  if (!target_dir) {
    if (sources.length > 1) throw new ShellError(`${target}: no such folder`);
    const parent = parent_of(target);
    assert_writable(parent, elevated);
    const parent_dir = await require_directory(files, parent);
    const [moved] = await (mode === "copy" ? files.copy_paths(sources, parent) : files.move_paths(sources, parent));
    if (moved !== target) await files.rename_entry(parent_dir, name_of(moved), name_of(target));
    return [await require_stat(files, target)];
  }

  assert_writable(target, elevated);
  const placed = await (mode === "copy" ? files.copy_paths(sources, target) : files.move_paths(sources, target));
  return Promise.all(placed.map((path) => require_stat(files, path)));
}

export async function rm(files: FilesService, context: CommandContext<{ paths: string[]; recursive: boolean; force: boolean }>) {
  const paths = await paths_from(context.args.paths, context);
  if (paths.length === 0) throw new ShellError("rm: nothing to delete");
  for (const path of paths) {
    const found = await require_stat(files, path);
    assert_removable(path, context.elevated);
    if (mount_point_of(path) && !context.args.force)
      throw new ShellError(`rm: ${path} is on your disk and can't be undone (use -f)`);
    if (found.kind === "directory" && !context.args.recursive) throw new ShellError(`rm: ${path} is a folder (use -r)`);
  }
  for (const path of paths) {
    context.signal.throwIfAborted();
    await files.delete_entry(await require_directory(files, parent_of(path)), name_of(path), { recursive: true });
  }
}

export async function* mkdir(
  files: FilesService,
  { args, session, elevated }: CommandContext<{ paths: string[]; parents: boolean }>
) {
  for (const typed of args.paths) {
    const path = resolve_path(session.cwd, typed);
    const segments = split_path(path);
    let directory = await files.get_root();
    for (const [index, segment] of segments.entries()) {
      const here = join_path(segments.slice(0, index + 1));
      const last = index === segments.length - 1;
      // By path, not by handle: /mnt/<name> resolves to the mounted folder.
      const existing = await files.get_directory(here);
      if (existing) {
        if (last && !args.parents) throw new ShellError(`mkdir: ${here} already exists`);
        directory = existing;
        continue;
      }
      if (!last && !args.parents)
        throw new ShellError(`mkdir: ${join_path(segments.slice(0, index))} has no ${segment} (use -p)`);
      assert_creatable(here, elevated);
      directory = await files.create_directory(directory, segment);
    }
    yield file_value(path, "directory");
  }
}

export async function* touch(files: FilesService, { args, session, elevated }: CommandContext<{ paths: string[] }>) {
  for (const typed of args.paths) {
    const path = resolve_path(session.cwd, typed);
    const existing = await stat(files, path);
    if (existing) {
      yield existing;
      continue;
    }
    assert_creatable(path, elevated);
    await files.create_file(await require_directory(files, parent_of(path)), name_of(path), { content: "" });
    yield await require_stat(files, path);
  }
}

export async function* du(files: FilesService, context: CommandContext<{ paths: string[] }>) {
  const given = await paths_from(context.args.paths, context);
  const paths = given.length > 0 ? given : [context.session.cwd];
  for (const path of paths) {
    context.signal.throwIfAborted();
    const found = await require_stat(files, path);
    if (found.kind === "file") yield found;
    else yield { ...found, size: await files.get_directory_size(await require_directory(files, path)) };
  }
}

export async function df(files: FilesService) {
  const { usage, quota } = await files.get_storage_estimate();
  return { $type: "storage", used: usage, quota, free: Math.max(0, quota - usage) };
}

export async function umount(files: FilesService, { args, session }: CommandContext<{ path: string }>) {
  const path = resolve_path(session.cwd, args.path);
  if (!files.mounts.some((mount) => mount.path === path)) throw new ShellError(`umount: ${path} isn't a mount`);
  if (session.cwd === path || session.cwd.startsWith(`${path}/`)) session.cwd = PATHS.home;
  await files.unmount(path);
}
