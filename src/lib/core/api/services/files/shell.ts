import { z } from "zod";
import { format_bytes, format_datetime } from "$lib/core/utils";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution, type Tagged, type Value } from "../shell/type";
import { is_tagged } from "../shell/values";
import { is_read_only_path, is_system_path } from "./hierarchy";
import { split_path } from "./path";
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

export function file_value(
  path: string,
  kind: "file" | "directory",
  size: number | null = null,
  modified: number | null = null
): FileValue {
  return { $type: "file", name: split_path(path).at(-1) ?? "/", path, kind, size, modified };
}

export function is_file_value(value: Value): value is FileValue {
  return is_tagged(value) && value.$type === "file" && typeof value.path === "string";
}

/** OPFS writes are the OS's in system folders; `sudo` is the way in (ADR-033). */
export function assert_writable(path: string, elevated: boolean): void {
  if (is_read_only_path(path) && !is_system_path(path)) throw new ShellError(`${path}: holds mounts only. Use mount to add a folder`);
  if (!elevated && is_system_path(path))
    throw new ShellError(`${path}: system folders are read-only. Use sudo to change them`);
}

const logic = () => import("./shell-run");

export function files_shell(files: FilesService): ShellContribution {
  return {
    completers: { [ArgKind.PATH]: async (partial, context) => (await logic()).complete_path(files, partial, context) },
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
          return file.kind === "directory"
            ? `${file.name}/`
            : file.size === null
              ? file.name
              : `${file.name}  ${format_bytes(file.size)}`;
        },
      },
      mount: {
        columns: ["path", "state"],
        text: (value) => `${value.path}  ${value.state}`,
      },
      storage: {
        columns: ["used", "quota", "free"],
        cell: (value, column) => format_bytes(Number(value[column])),
        text: (value) =>
          `${format_bytes(Number(value.used))} used of ${format_bytes(Number(value.quota))}, ${format_bytes(Number(value.free))} free`,
      },
    },
    commands: [
      define_command({
        id: "ls",
        description: "List a folder",
        args: z.object({ path: arg.path().optional().describe("Folder or file, the current folder by default") }),
        positional: ["path"],
        yields: "file",
        async *run(context) {
          yield* (await logic()).ls(files, context);
        },
      }),
      define_command({
        id: "cd",
        description: "Change the current folder",
        args: z.object({ path: arg.path().default("~").describe("Folder, home by default") }),
        positional: ["path"],
        run: async (context) => (await logic()).cd(files, context),
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
          yield* (await logic()).cat(files, context);
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
        run: async (context) => (await logic()).transfer(files, "copy", context),
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
        run: async (context) => (await logic()).transfer(files, "move", context),
      }),
      define_command({
        id: "rm",
        description: "Delete files and folders",
        args: z.object({
          paths: z.array(arg.path()).default([]).describe("What to delete, or the files piped in"),
          recursive: z.boolean().default(false).describe("Delete folders and everything in them"),
          force: z.boolean().default(false).describe("Needed under /mnt, where deletes hit the real disk"),
        }),
        positional: ["paths"],
        short: { recursive: "r", force: "f" },
        run: async (context) => (await logic()).rm(files, context),
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
        async *run(context) {
          yield* (await logic()).mkdir(files, context);
        },
      }),
      define_command({
        id: "touch",
        description: "Create empty files",
        args: z.object({ paths: z.array(arg.path()).min(1) }),
        positional: ["paths"],
        yields: "file",
        async *run(context) {
          yield* (await logic()).touch(files, context);
        },
      }),
      define_command({
        id: "du",
        description: "Size of files and folders",
        args: z.object({ paths: z.array(arg.path()).default([]) }),
        positional: ["paths"],
        yields: "file",
        async *run(context) {
          yield* (await logic()).du(files, context);
        },
      }),
      define_command({
        id: "mount",
        description: "Mount a folder from your disk at /mnt",
        available: () => files.can_mount,
        yields: "file",
        run: async () => {
          const path = await files.pick_mount();
          return path ? file_value(path, "directory") : undefined;
        },
      }),
      define_command({
        id: "umount",
        description: "Unmount a folder; the folder on your disk stays",
        args: z.object({ path: arg.path().describe("The mount, /mnt/<name>") }),
        positional: ["path"],
        complete: (field, partial) =>
          field === "path" ? files.mounts.filter((mount) => mount.path.startsWith(partial)).map((mount) => ({ value: mount.path, detail: mount.state })) : undefined,
        available: () => files.mounts.length > 0,
        run: async (context) => (await logic()).umount(files, context),
      }),
      define_command({
        id: "mounts",
        description: "Mounted folders and whether they're connected",
        yields: "mount",
        *run() {
          for (const mount of files.mounts) yield { $type: "mount", path: mount.path, state: mount.state };
        },
      }),
      define_command({
        id: "df",
        description: "Storage used and free",
        run: async () => (await logic()).df(files),
      }),
    ],
  };
}
