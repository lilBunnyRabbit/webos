import kernel, { type FilesService } from "$lib/core/api";
import { report_file_error } from "./file-explorer.errors";

/**
 * Native drag and drop of WebOS entries (ADR-011 revision): the desktop and every File Explorer window speak it, so a
 * drag can cross from one to another. The data is the absolute paths, as JSON.
 */
export const PATHS_TYPE = "application/x-webos-paths";

export function set_drag_paths(event: DragEvent, paths: string[]): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(PATHS_TYPE, JSON.stringify(paths));
  event.dataTransfer.setData("text/plain", paths.join("\n"));
  event.dataTransfer.effectAllowed = "move";
}

/** Readable during `dragover`, when the data itself isn't. */
export function has_drag_paths(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes(PATHS_TYPE) ?? false;
}

export function read_drag_paths(event: DragEvent): string[] {
  try {
    const value: unknown = JSON.parse(event.dataTransfer?.getData(PATHS_TYPE) ?? "");
    return Array.isArray(value) ? value.filter((path): path is string => typeof path === "string") : [];
  } catch {
    return [];
  }
}

/** A drop of real files or folders from the OS (or another app). */
export function has_os_files(event: DragEvent): boolean {
  return event.dataTransfer?.types.includes("Files") ?? false;
}

type HandleItem = DataTransferItem & { getAsFileSystemHandle?: () => Promise<FileSystemHandle | null> };

/**
 * The dropped files and folders. Call it inside the `drop` handler before any `await`: the items are only readable
 * while the event is being dispatched. Folders need `getAsFileSystemHandle` (Chromium); elsewhere they're skipped.
 */
export function read_os_entries(event: DragEvent): Promise<(File | FileSystemHandle)[]> {
  // Both reads happen now, while the event is live. The handle is null for files that aren't on a disk (an image
  // dragged out of another app), so the plain File is the fallback.
  const pending = [...(event.dataTransfer?.items ?? [])]
    .filter((item) => item.kind === "file")
    .map((item: HandleItem) => {
      const file = item.getAsFile();
      const handle = item.getAsFileSystemHandle?.();
      return handle ? handle.then((value) => value ?? file, () => file) : Promise.resolve(file);
    });
  return Promise.all(pending).then((entries) => entries.filter((entry): entry is File | FileSystemHandle => entry !== null));
}

/** Imports dropped OS files into `target`, keeping both on a clash. Resolves with the new paths, `[]` on failure. */
export async function import_dropped(entries: Promise<(File | FileSystemHandle)[]>, target: string): Promise<string[]> {
  try {
    const list = await entries;
    if (list.length === 0) return [];
    return await kernel.service<FilesService>("files").import_entries(target, list);
  } catch (error) {
    report_file_error("Couldn't import the dropped items", error);
    return [];
  }
}

/** Moves dropped entries into `target`, keeping both on a clash. Resolves with the new paths, `[]` on failure. */
export async function drop_paths(paths: string[], target: string): Promise<string[]> {
  if (paths.length === 0) return [];
  try {
    return await kernel.service<FilesService>("files").move_paths(paths, target);
  } catch (error) {
    report_file_error(paths.length === 1 ? "Couldn't move the item" : `Couldn't move ${paths.length} items`, error);
    return [];
  }
}
