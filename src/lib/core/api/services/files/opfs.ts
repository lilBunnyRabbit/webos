import type {
  FileSystemItem,
  FileSystemFileItem,
  ListOptions,
  CreateFileOptions,
  UploadOptions,
} from "./type";

export async function get_root(): Promise<FileSystemDirectoryHandle> {
  return await navigator.storage.getDirectory();
}

export function default_sort(a: FileSystemItem, b: FileSystemItem): number {
  if (a.kind !== b.kind) {
    return a.kind === "directory" ? -1 : 1;
  }
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
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
    if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError")) return null;
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
    if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "TypeMismatchError")) return null;
    if (error instanceof TypeError) return null;
    throw error;
  }
}

export async function create_directory(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<FileSystemDirectoryHandle> {
  return await parent.getDirectoryHandle(await available_name(parent, name), { create: true });
}

export async function create_file(
  parent: FileSystemDirectoryHandle,
  name: string,
  options: CreateFileOptions = {}
): Promise<FileSystemFileHandle> {
  const { content, overwrite = false } = options;

  const target_name = overwrite ? name : await available_name(parent, name);
  const file_handle = await parent.getFileHandle(target_name, { create: true });

  if (content !== undefined) {
    await write_file(file_handle, content);
  }

  return file_handle;
}

export async function write_file(
  handle: FileSystemFileHandle,
  content: string | Blob | BufferSource
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
    await writable.close();
  } catch (err) {
    // An unclosed writable keeps the file locked until GC; abort releases it.
    await writable.abort().catch(() => {});
    throw err;
  }
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
  await parent.removeEntry(name, { recursive: options.recursive ?? false });
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
  const file = await source.getFile();
  const target_name = await available_name(target_dir, new_name ?? file.name);
  const target_handle = await target_dir.getFileHandle(target_name, { create: true });
  await write_file(target_handle, file);
  return target_handle;
}

/** Recursively copies a folder into `target_dir` (auto-renamed on clash), returning the new folder. */
export async function copy_directory(
  source: FileSystemDirectoryHandle,
  target_dir: FileSystemDirectoryHandle,
  new_name?: string
): Promise<FileSystemDirectoryHandle> {
  const target = await target_dir.getDirectoryHandle(await available_name(target_dir, new_name ?? source.name), {
    create: true,
  });

  for (const item of await list_directory(source, { include_metadata: false })) {
    if (item.kind === "file") await copy_file(item.handle, target);
    else await copy_directory(item.handle, target);
  }

  return target;
}

/** Renames an entry in place. Fails if `new_name` is taken: a rename never silently becomes "name (1)". */
export async function rename_entry(parent: FileSystemDirectoryHandle, name: string, new_name: string): Promise<void> {
  if (name === new_name) return;
  if (await exists(parent, new_name)) {
    throw new DOMException(`"${new_name}" already exists`, "InvalidModificationError");
  }

  const kind = (await exists(parent, name, "directory")) ? "directory" : "file";
  if (kind === "file") {
    await (await parent.getFileHandle(name)).move(parent, new_name);
  } else {
    await move_directory(parent, await parent.getDirectoryHandle(name), parent, new_name);
  }
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

  // Native move keeps the handle valid, now pointing at the new location.
  await source.move(target_dir, await available_name(target_dir, target_name));
  return source;
}

/** OPFS directory handles have no native `move()`, so the tree is recreated and each file moved natively. */
export async function move_directory(
  source_parent: FileSystemDirectoryHandle,
  source: FileSystemDirectoryHandle,
  target_dir: FileSystemDirectoryHandle,
  new_name?: string
): Promise<FileSystemDirectoryHandle> {
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
}

/** Returns `name`, or `name (1).ext`, `name (2).ext`, … if it's taken. Dotfiles keep their leading dot. */
export async function available_name(dir: FileSystemDirectoryHandle, name: string): Promise<string> {
  if (!(await exists(dir, name))) return name;

  const dot = name.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];

  for (let n = 1; ; n++) {
    const candidate = `${stem} (${n})${ext}`;
    if (!(await exists(dir, candidate))) return candidate;
  }
}

export async function upload_files(
  target_dir: FileSystemDirectoryHandle,
  options: UploadOptions = {}
): Promise<File[]> {
  const { multiple = true, accept } = options;

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;
    if (accept) {
      input.accept = accept;
    }

    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (!files || files.length === 0) {
        resolve([]);
        return;
      }

      try {
        const uploaded: File[] = [];
        for (const file of Array.from(files)) {
          const name = await available_name(target_dir, file.name);
          const file_handle = await target_dir.getFileHandle(name, { create: true });
          await write_file(file_handle, file);
          uploaded.push(await file_handle.getFile());
        }
        resolve(uploaded);
      } catch (err) {
        reject(err);
      }
    };

    input.oncancel = () => {
      resolve([]);
    };

    input.click();
  });
}

type WellKnownDirectory = "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";

// File System Access pickers; TypeScript's DOM lib doesn't declare them yet.
interface DiskPickers {
  showSaveFilePicker(options?: { suggestedName?: string; startIn?: WellKnownDirectory }): Promise<FileSystemFileHandle>;
  showDirectoryPicker(options?: { mode?: "read" | "readwrite"; startIn?: WellKnownDirectory }): Promise<FileSystemDirectoryHandle>;
}

const disk = () => window as unknown as Window & DiskPickers;
const is_abort = (error: unknown) => error instanceof DOMException && error.name === "AbortError";

/**
 * Copies a file or folder out of OPFS onto the real disk. A file goes through the native Save dialog; a folder is copied
 * whole into a folder the user picks (auto-renamed there on clash). Resolves the name written, or `null` if cancelled.
 */
export async function export_to_disk(handle: FileSystemFileHandle | FileSystemDirectoryHandle): Promise<string | null> {
  try {
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
