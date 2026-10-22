import { pick_device_files } from "$lib/core/utils/device-file";
import { download_blob } from "$lib/core/utils/download";
import type { FileSystemItem, FileSystemFileItem, ListOptions, CreateFileOptions, UploadOptions } from "./type";
import { file_stem } from "./path";

export async function get_root(): Promise<FileSystemDirectoryHandle> {
  return await navigator.storage.getDirectory();
}

let held = false;
let running = 0;
const drained: Array<() => void> = [];

// Every write in this module passes through here, so a backup restore (ADR-037) can stop the running OS from saving
// stale in-memory state over the folders it just replaced. The restore itself writes through native handles.
async function writing<T>(write: () => Promise<T>): Promise<T> {
  if (held) throw new DOMException("Writes are on hold while a backup is restored", "NoModificationAllowedError");
  running++;
  try {
    return await write();
  } finally {
    if (--running === 0) for (const resolve of drained.splice(0)) resolve();
  }
}

/**
 * Makes every write through this module (so through FilesService and DirectoryHandler) reject until the returned
 * release runs. Resolves once the writes already under way have finished. For backup restore, which reloads after.
 */
export async function hold_writes(): Promise<() => void> {
  held = true;
  if (running > 0) await new Promise<void>((resolve) => drained.push(resolve));
  return () => {
    held = false;
  };
}

export function default_sort(a: FileSystemItem, b: FileSystemItem): number {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
}

/** Unchanged entries keep their old object, so a keyed list re-renders only the rows that changed. */
export function keep_unchanged(previous: FileSystemItem[], next: FileSystemItem[]): FileSystemItem[] {
  const by_name = new Map(previous.map((item) => [item.name, item]));
  return next.map((item) => {
    const old = by_name.get(item.name);
    if (!old || old.kind !== item.kind) return item;
    if (old.kind === "file" && item.kind === "file") {
      const same = old.size === item.size && old.last_modified === item.last_modified && old.type === item.type;
      return same ? old : item;
    }
    return old;
  });
}

export async function list_directory(
  dir: FileSystemDirectoryHandle,
  options: ListOptions = {}
): Promise<FileSystemItem[]> {
  const { include_metadata = true, sort = default_sort } = options;
  const pending: Promise<FileSystemItem>[] = [];

  for await (const [name, handle] of dir.entries()) {
    if (handle.kind === "directory") {
      pending.push(Promise.resolve({ name, kind: "directory", handle: handle as FileSystemDirectoryHandle }));
      continue;
    }

    const item: FileSystemFileItem = { name, kind: "file", handle: handle as FileSystemFileHandle };
    if (!include_metadata) {
      pending.push(Promise.resolve(item));
      continue;
    }

    pending.push(
      item.handle.getFile().then(
        (file) => ({ ...item, size: file.size, last_modified: file.lastModified, type: file.type }),
        (err) => {
          console.warn(`Failed to get file metadata for ${name}:`, err);
          return item;
        }
      )
    );
  }

  const items = await Promise.all(pending);
  items.sort(sort);
  return items;
}

export async function get_directory_handle(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: { create?: boolean } = {}
): Promise<FileSystemDirectoryHandle> {
  return await parent.getDirectoryHandle(name, options);
}

export async function get_file_handle(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: { create?: boolean } = {}
): Promise<FileSystemFileHandle> {
  return await parent.getFileHandle(name, options);
}

/** Resolves a file by path segments from `root`. Missing entries, a directory at the path, or an invalid name return `null`. */
export async function get_file_at(root: FileSystemDirectoryHandle, segments: string[]): Promise<File | null> {
  const name = segments.at(-1);
  if (name === undefined) return null;

  try {
    let dir = root;
    for (const segment of segments.slice(0, -1)) {
      dir = await dir.getDirectoryHandle(segment);
    }
    return await (await dir.getFileHandle(name)).getFile();
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError"))
      return null;
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export async function get_directory_at(
  root: FileSystemDirectoryHandle,
  segments: string[]
): Promise<FileSystemDirectoryHandle | null> {
  try {
    let dir = root;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment);
    }
    return dir;
  } catch (error) {
    if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError"))
      return null;
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export async function create_directory(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return writing(async () => parent.getDirectoryHandle(await available_name(parent, name), { create: true }));
}

export async function create_file(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: CreateFileOptions = {}
): Promise<FileSystemFileHandle> {
  const { content, overwrite = false } = options;

  return writing(async () => {
    const target_name = overwrite ? name : await available_name(parent, name);
    const file_handle = await parent.getFileHandle(target_name, { create: true });

    if (content !== undefined) {
      await write_file(file_handle, content);
    }

    return file_handle;
  });
}

export async function write_file(handle: FileSystemFileHandle, content: string | Blob | BufferSource): Promise<void> {
  return writing(async () => {
    const writable = await handle.createWritable();
    try {
      await writable.write(content);
      await writable.close();
    } catch (err) {
      // An unclosed writable keeps the file locked until GC; abort releases it.
      await writable.abort().catch(() => {});
      throw err;
    }
  });
}

export async function read_file(handle: FileSystemFileHandle): Promise<File> {
  return await handle.getFile();
}

export async function read_file_as_text(handle: FileSystemFileHandle): Promise<string> {
  const file = await handle.getFile();
  return await file.text();
}

export async function read_file_as_array_buffer(handle: FileSystemFileHandle): Promise<ArrayBuffer> {
  const file = await handle.getFile();
  return await file.arrayBuffer();
}

export async function read_file_as_blob(handle: FileSystemFileHandle): Promise<Blob> {
  return await handle.getFile();
}

export async function delete_entry(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: { recursive?: boolean } = {}
): Promise<void> {
  return writing(() => parent.removeEntry(name, { recursive: options.recursive ?? false }));
}

export async function exists(
  parent: FileSystemDirectoryHandle,
  name: string,
  kind?: "file" | "directory"
): Promise<boolean> {
  try {
    if (kind === "file") {
      await parent.getFileHandle(name);
    } else if (kind === "directory") {
      await parent.getDirectoryHandle(name);
    } else {
      try {
        await parent.getFileHandle(name);
        return true;
      } catch {
        await parent.getDirectoryHandle(name);
      }
    }
    return true;
  } catch {
    return false;
  }
}

export async function copy_file(
  source: FileSystemFileHandle,
  target_dir: FileSystemDirectoryHandle,
  new_name?: string
): Promise<FileSystemFileHandle> {
  return writing(async () => {
    const file = await source.getFile();
    const target_name = await available_name(target_dir, new_name ?? file.name);
    const target_handle = await target_dir.getFileHandle(target_name, { create: true });
    await write_file(target_handle, file);
    return target_handle;
  });
}

/** Recursively copies a folder into `target_dir` (auto-renamed on clash), returning the new folder. */
export async function copy_directory(
  source: FileSystemDirectoryHandle,
  target_dir: FileSystemDirectoryHandle,
  new_name?: string
): Promise<FileSystemDirectoryHandle> {
  return writing(async () => {
    const target = await target_dir.getDirectoryHandle(await available_name(target_dir, new_name ?? source.name), {
      create: true,
    });

    for (const item of await list_directory(source, { include_metadata: false })) {
      if (item.kind === "file") await copy_file(item.handle, target);
      else await copy_directory(item.handle, target);
    }

    return target;
  });
}

/** Renames an entry in place. Fails if `new_name` is taken: a rename never silently becomes "name (1)". */
export async function rename_entry(parent: FileSystemDirectoryHandle, name: string, new_name: string): Promise<void> {
  if (name === new_name) return;
  return writing(async () => {
    if (await exists(parent, new_name)) {
      throw new DOMException(`"${new_name}" already exists`, "InvalidModificationError");
    }

    const kind = (await exists(parent, name, "directory")) ? "directory" : "file";
    if (kind === "file") {
      await (await parent.getFileHandle(name)).move(parent, new_name);
    } else {
      await move_directory(parent, await parent.getDirectoryHandle(name), parent, new_name);
    }
  });
}

export async function move_file(
  source_parent: FileSystemDirectoryHandle,
  source: FileSystemFileHandle,
  target_dir: FileSystemDirectoryHandle,
  new_name?: string
): Promise<FileSystemFileHandle> {
  const target_name = new_name ?? source.name;
  if (target_name === source.name && (await source_parent.isSameEntry(target_dir))) {
    return source;
  }

  return writing(async () => {
    // Native move keeps the handle valid, now pointing at the new location.
    await source.move(target_dir, await available_name(target_dir, target_name));
    return source;
  });
}

/** OPFS directory handles have no native `move()`, so the tree is recreated and each file moved natively. */
export async function move_directory(
  source_parent: FileSystemDirectoryHandle,
  source: FileSystemDirectoryHandle,
  target_dir: FileSystemDirectoryHandle,
  new_name?: string
): Promise<FileSystemDirectoryHandle> {
  return writing(async () => {
    const target = await target_dir.getDirectoryHandle(await available_name(target_dir, new_name ?? source.name), {
      create: true,
    });

    for (const item of await list_directory(source, { include_metadata: false })) {
      if (item.kind === "file") {
        await move_file(source, item.handle, target);
      } else {
        await move_directory(source, item.handle, target);
      }
    }

    await source_parent.removeEntry(source.name);
    return target;
  });
}

/** Returns `name`, or `name (1).ext`, `name (2).ext`, … if it's taken. Dotfiles keep their leading dot. */
export async function available_name(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  if (!(await exists(dir, name))) return name;

  const stem = file_stem(name);
  const ext = name.slice(stem.length);

  for (let n = 1; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await exists(dir, candidate))) return candidate;
  }
}

/** Writes a `File` from outside OPFS into `target_dir` under a free name. The one path for uploads and drops. */
export async function store_file(target_dir: FileSystemDirectoryHandle, file: File): Promise<FileSystemFileHandle> {
  return writing(async () => {
    const handle = await target_dir.getFileHandle(await available_name(target_dir, file.name), { create: true });
    await write_file(handle, file);
    return handle;
  });
}

export async function upload_files(
  target_dir: FileSystemDirectoryHandle,
  options: UploadOptions = {}
): Promise<File[]> {
  const { multiple = true, accept } = options;
  const uploaded: File[] = [];
  for (const file of await pick_device_files({ multiple, accept: accept ? [accept] : undefined })) {
    uploaded.push(await (await store_file(target_dir, file)).getFile());
  }
  return uploaded;
}

type WellKnownDirectory = "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";

// File System Access pickers; TypeScript's DOM lib doesn't declare them yet.
interface DiskPickers {
  showSaveFilePicker(options?: { suggestedName?: string; startIn?: WellKnownDirectory }): Promise<FileSystemFileHandle>;
  showDirectoryPicker(options?: {
    mode?: "read" | "readwrite";
    startIn?: WellKnownDirectory;
  }): Promise<FileSystemDirectoryHandle>;
}

const disk = () => window as unknown as Window & DiskPickers;
const is_abort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/** Android and iOS browsers have no folder picker, so mounting is hidden there (ADR-044). */
export const can_pick_folders = typeof window !== "undefined" && "showDirectoryPicker" in window;

const can_pick_save = typeof window !== "undefined" && "showSaveFilePicker" in window;

/** The browser's folder chooser. Must run inside a user gesture. Resolves `null` on cancel. */
export async function pick_disk_folder(mode: "read" | "readwrite" = "readwrite"): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await disk().showDirectoryPicker({ mode });
  } catch (error) {
    if (is_abort(error)) return null;
    throw error;
  }
}

/**
 * Copies a file or folder out of OPFS onto the real disk. A file goes through the native Save dialog, or the browser's
 * downloads where there's none (Firefox, Safari); a folder is copied whole into a folder the user picks (auto-renamed
 * there on clash), so it needs `can_pick_folders`. Resolves the name written, or `null` if cancelled.
 */
export async function export_to_disk(handle: FileSystemFileHandle | FileSystemDirectoryHandle): Promise<string | null> {
  try {
    if (handle.kind === "file" && !can_pick_save) {
      download_blob(await handle.getFile(), handle.name);
      return handle.name;
    }
    if (handle.kind === "file") {
      const target = await disk().showSaveFilePicker({ suggestedName: handle.name, startIn: "downloads" });
      await write_file(target, await handle.getFile());
      return target.name;
    }
    const parent = await disk().showDirectoryPicker({ mode: "readwrite", startIn: "downloads" });
    return (await copy_directory(handle, parent)).name;
  } catch (error) {
    if (is_abort(error)) return null;
    throw error;
  }
}

export async function get_storage_estimate(): Promise<{ usage: number; quota: number }> {
  const estimate = await navigator.storage.estimate();
  return {
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
  };
}

export async function get_directory_size(dir: FileSystemDirectoryHandle): Promise<number> {
  let total = 0;
  const items = await list_directory(dir, { include_metadata: true });

  for (const item of items) {
    if (item.kind === "file" && item.size != null) {
      total += item.size;
    } else if (item.kind === "directory") {
      total += await get_directory_size(item.handle as FileSystemDirectoryHandle);
    }
  }

  return total;
}

export async function clear_opfs(): Promise<void> {
  const root = await get_root();
  const items = await list_directory(root, { include_metadata: false });
  for (const item of items) {
    await delete_entry(root, item.name, { recursive: true });
  }
}
