import { z } from "zod";
import { format_bytes, format_datetime } from "$lib/core/utils";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type CommandContext, type Completion, type ShellContribution, type ShellSession, type Tagged, type Value } from "../shell/type";
import { is_tagged } from "../shell/values";
import { is_locked_path, is_system_path } from "./hierarchy";
import { join_path, resolve_path, split_path } from "./path";
import type { FilesService } from "./type";

export interface FileValue extends Tagged {
  $type: "file";
  name: string;
  path: string;
  kind: "file" | "directory";
  /** Bytes; `null` for a folder unless `du` measured it. */
  size: number | null;
  modified: number | null;
}

export function file_value(path: string, kind: "file" | "directory", size: number | null = null, modified: number | null = null): FileValue {
  return { $type: "file", name: split_path(path).at(-1) ?? "/", path, kind, size, modified };
}

export function is_file_value(value: Value): value is FileValue {
  return is_tagged(value) && value.$type === "file" && typeof value.path === "string";
}

/** Text files print, anything with a NUL in its first 8 KB is binary. Bigger than this prints as a file value. */
const CAT_LIMIT = 1024 * 1024;

const parent_of = (path: string) => join_path(split_path(path).slice(0, -1));
const name_of = (path: string) => split_path(path).at(-1) ?? "";

/** OPFS writes are the OS's in system folders; `sudo` is the way in (ADR-033). */
export function assert_writable(path: string, elevated: boolean): void {
  if (!elevated && is_system_path(path)) throw new ShellError(`${path}: system folders are read-only. Use sudo to change them`);
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

export function files_shell(files: FilesService): ShellContribution {
  async function stat(path: string): Promise<FileValue | null> {
    if (path === "/") return file_value("/", "directory");
    if (await files.get_directory(path)) return file_value(path, "directory");
    const file = await files.get_file(path);
    return file ? file_value(path, "file", file.size, file.lastModified) : null;
  }

  async function require_stat(path: string): Promise<FileValue> {
    const found = await stat(path);
    if (!found) throw new ShellError(`${path}: no such file or folder`);
    return found;
  }

  async function require_directory(path: string): Promise<FileSystemDirectoryHandle> {
    const directory = await files.get_directory(path);
    if (!directory) throw new ShellError(`${path}: no such folder`);
    return directory;
  }

  async function complete_path(partial: string, { session }: { session: ShellSession }): Promise<Completion[]> {
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

  async function transfer(mode: "copy" | "move", context: CommandContext<{ from: string[]; to: string; recursive?: boolean }>) {
    const { args, session, elevated } = context;
    const sources = await paths_from(args.from, context);
    if (sources.length === 0) throw new ShellError(`${mode === "copy" ? "cp" : "mv"}: nothing to ${mode}`);
    const target = resolve_path(session.cwd, args.to);
    const target_dir = await files.get_directory(target);

    for (const source of sources) {
      const found = await require_stat(source);
      if (mode === "copy" && found.kind === "directory" && !args.recursive) throw new ShellError(`cp: ${source} is a folder (use -r)`);
      if (mode === "move") assert_removable(source, elevated);
    }

    // One source onto a name that isn't a folder: copy or move it under that name.
    if (!target_dir) {
      if (sources.length > 1) throw new ShellError(`${target}: no such folder`);
      const parent = parent_of(target);
      assert_writable(parent, elevated);
      const parent_dir = await require_directory(parent);
      const [moved] = await (mode === "copy" ? files.copy_paths(sources, parent) : files.move_paths(sources, parent));
      if (moved !== target) await files.rename_entry(parent_dir, name_of(moved), name_of(target));
      return [await require_stat(target)];
    }

    assert_writable(target, elevated);
    const placed = await (mode === "copy" ? files.copy_paths(sources, target) : files.move_paths(sources, target));
    return Promise.all(placed.map(require_stat));
  }

  return {
    completers: { [ArgKind.PATH]: complete_path },
    values: {
      file: {
        columns: ["name", "size", "modified"],
        cell(value, column) {
          const file = value as FileValue;
          if (column === "name") return file.kind === "directory" ? `${file.name}/` : file.name;
          if (column === "size") return file.size === null ? "" : format_bytes(file.size);
          if (column === "modified") return file.modified === null ? "" : format_datetime(file.modified);
          return String(value[column] ?? "");
        },
        text(value) {
          const file = value as FileValue;
          return file.kind === "directory" ? `${file.name}/` : file.size === null ? file.name : `${file.name}  ${format_bytes(file.size)}`;
        },
      },
      storage: {
        columns: ["used", "quota", "free"],
        cell: (value, column) => format_bytes(Number(value[column])),
        text: (value) => `${format_bytes(Number(value.used))} used of ${format_bytes(Number(value.quota))}, ${format_bytes(Number(value.free))} free`,
      },
    },
    commands: [
      define_command({
        id: "ls",
        description: "List a folder",
        args: z.object({ path: arg.path().optional().describe("Folder or file, the current folder by default") }),
        positional: ["path"],
        yields: "file",
        async *run({ args, session }) {
          const path = resolve_path(session.cwd, args.path ?? ".");
          const directory = await files.get_directory(path);
          if (!directory) {
            yield await require_stat(path);
            return;
          }
          for (const item of await files.list(directory, { include_metadata: true })) {
            const child = join_path(split_path(path), item.name);
            yield item.kind === "directory" ? file_value(child, "directory") : file_value(child, "file", item.size ?? null, item.last_modified ?? null);
          }
        },
      }),
      define_command({
        id: "cd",
        description: "Change the current folder",
        args: z.object({ path: arg.path().default("~").describe("Folder, home by default") }),
        positional: ["path"],
        async run({ args, session }) {
          const path = resolve_path(session.cwd, args.path);
          await require_directory(path);
          session.cwd = path;
        },
      }),
      define_command({
        id: "pwd",
        description: "The current folder",
        run: ({ session }) => session.cwd,
      }),
      define_command({
        id: "cat",
        description: "Print text files",
        args: z.object({ paths: z.array(arg.path()).default([]) }),
        positional: ["paths"],
        async *run(context) {
          for (const path of await paths_from(context.args.paths, context)) {
            const file = await files.get_file(path);
            if (!file) throw new ShellError(`${path}: no such file`);
            const head = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
            if (file.size > CAT_LIMIT || head.includes(0)) yield file_value(path, "file", file.size, file.lastModified);
            else yield await file.text();
          }
        },
      }),
      define_command({
        id: "cp",
        description: "Copy files and folders",
        args: z.object({
          from: z.array(arg.path()).default([]).describe("Sources, or the files piped in"),
          to: arg.path().describe("Target folder, or a new name for one source"),
          recursive: z.boolean().default(false).describe("Copy folders too"),
        }),
        positional: ["from", "to"],
        short: { recursive: "r" },
        yields: "file",
        run: (context) => transfer("copy", context),
      }),
      define_command({
        id: "mv",
        description: "Move or rename files and folders",
        args: z.object({
          from: z.array(arg.path()).default([]).describe("Sources, or the files piped in"),
          to: arg.path().describe("Target folder, or a new name for one source"),
        }),
        positional: ["from", "to"],
        yields: "file",
        run: (context) => transfer("move", context),
      }),
      define_command({
        id: "rm",
        description: "Delete files and folders",
        args: z.object({
          paths: z.array(arg.path()).default([]).describe("What to delete, or the files piped in"),
          recursive: z.boolean().default(false).describe("Delete folders and everything in them"),
        }),
        positional: ["paths"],
        short: { recursive: "r" },
        async run(context) {
          const paths = await paths_from(context.args.paths, context);
          if (paths.length === 0) throw new ShellError("rm: nothing to delete");
          for (const path of paths) {
            const found = await require_stat(path);
            assert_removable(path, context.elevated);
            if (found.kind === "directory" && !context.args.recursive) throw new ShellError(`rm: ${path} is a folder (use -r)`);
          }
          for (const path of paths) {
            context.signal.throwIfAborted();
            await files.delete_entry(await require_directory(parent_of(path)), name_of(path), { recursive: true });
          }
        },
      }),
      define_command({
        id: "mkdir",
        description: "Create folders",
        args: z.object({
          paths: z.array(arg.path()).min(1),
          parents: z.boolean().default(false).describe("Create missing parents, and don't mind existing folders"),
        }),
        positional: ["paths"],
        short: { parents: "p" },
        yields: "file",
        async *run({ args, session, elevated }) {
          for (const typed of args.paths) {
            const path = resolve_path(session.cwd, typed);
            const segments = split_path(path);
            let directory = await files.get_root();
            for (const [index, segment] of segments.entries()) {
              const here = join_path(segments.slice(0, index + 1));
              const last = index === segments.length - 1;
              if (await files.exists(directory, segment, "directory")) {
                if (last && !args.parents) throw new ShellError(`mkdir: ${here} already exists`);
                directory = await directory.getDirectoryHandle(segment);
                continue;
              }
              if (!last && !args.parents) throw new ShellError(`mkdir: ${join_path(segments.slice(0, index))} has no ${segment} (use -p)`);
              assert_writable(here, elevated);
              directory = await files.create_directory(directory, segment);
            }
            yield file_value(path, "directory");
          }
        },
      }),
      define_command({
        id: "touch",
        description: "Create empty files",
        args: z.object({ paths: z.array(arg.path()).min(1) }),
        positional: ["paths"],
        yields: "file",
        async *run({ args, session, elevated }) {
          for (const typed of args.paths) {
            const path = resolve_path(session.cwd, typed);
            const existing = await stat(path);
            if (existing) {
              yield existing;
              continue;
            }
            assert_writable(path, elevated);
            await files.create_file(await require_directory(parent_of(path)), name_of(path), { content: "" });
            yield await require_stat(path);
          }
        },
      }),
      define_command({
        id: "du",
        description: "Size of files and folders",
        args: z.object({ paths: z.array(arg.path()).default([]) }),
        positional: ["paths"],
        yields: "file",
        async *run(context) {
          const given = await paths_from(context.args.paths, context);
          const paths = given.length > 0 ? given : [context.session.cwd];
          for (const path of paths) {
            context.signal.throwIfAborted();
            const found = await require_stat(path);
            if (found.kind === "file") yield found;
            else yield { ...found, size: await files.get_directory_size(await require_directory(path)) };
          }
        },
      }),
      define_command({
        id: "df",
        description: "Storage used and free",
        async run() {
          const { usage, quota } = await files.get_storage_estimate();
          return { $type: "storage", used: usage, quota, free: Math.max(0, quota - usage) };
        },
      }),
    ],
  };
}

