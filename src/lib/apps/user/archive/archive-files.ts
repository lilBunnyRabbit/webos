import kernel, { type FilesService } from "$lib/core/api";
import { base_name, parent_path, type CreateItem } from "./create";
import { abort_error, type StreamOptions } from "./zip-format";
import { entry_blob, readable, type ZipEntry } from "./zip-read";
import type { ZipSource } from "./zip-write";

function files(): FilesService {
  return kernel.service<FilesService>("files");
}

export function join(folder: string, name: string): string {
  return `${folder === "/" ? "" : folder}/${name}`;
}

export interface ExtractResult {
  path: string;
  files: number;
  skipped: string[];
}

export async function extract_entries(
  source: Blob,
  entries: ZipEntry[],
  folder: string,
  name: string,
  options: StreamOptions,
  on_target?: (path: string) => void
): Promise<ExtractResult> {
  const parent = await files().get_directory(folder);
  if (!parent) throw new Error(`The folder ${folder} no longer exists.`);
  const target = await files().create_directory(parent, name);
  on_target?.(join(folder, target.name));
  const folders = new Map<string, FileSystemDirectoryHandle>([["", target]]);

  const folder_at = async (segments: string[]): Promise<FileSystemDirectoryHandle> => {
    const key = segments.join("/");
    const known = folders.get(key);
    if (known) return known;
    const handle = await files().create_directory(await folder_at(segments.slice(0, -1)), segments.at(-1)!);
    folders.set(key, handle);
    return handle;
  };

  let count = 0;
  const skipped: string[] = [];
  for (const entry of entries) {
    if (options.signal?.aborted) throw abort_error(options.signal);
    if (entry.directory) {
      await folder_at(entry.path);
      continue;
    }
    if (!readable(entry)) {
      skipped.push(entry.name);
      continue;
    }
    const directory = await folder_at(entry.path.slice(0, -1));
    const data = await entry_blob(source, entry, options);
    await files().create_file(directory, entry.path.at(-1)!, { content: data });
    count++;
  }
  return { path: join(folder, target.name), files: count, skipped };
}

async function walk(handle: FileSystemDirectoryHandle, prefix: string, out: ZipSource[]): Promise<void> {
  for (const item of await files().list(handle)) {
    const name = `${prefix}/${item.name}`;
    if (item.kind === "directory") {
      out.push({ name, directory: true });
      await walk(item.handle, name, out);
    } else {
      const file = await item.handle.getFile();
      out.push({ name, data: file, modified: new Date(file.lastModified) });
    }
  }
}

export async function item_at(path: string): Promise<CreateItem | null> {
  const name = base_name(path);
  const file = await files().get_file(path);
  if (file) {
    return { id: crypto.randomUUID(), name, directory: false, path, size: file.size, files: 1, sources: [{ name, data: file, modified: new Date(file.lastModified) }] };
  }
  const directory = await files().get_directory(path);
  if (!directory) return null;
  const sources: ZipSource[] = [{ name, directory: true }];
  await walk(directory, name, sources);
  const contents = sources.filter((source) => source.data);
  return {
    id: crypto.randomUUID(),
    name,
    directory: true,
    path,
    size: contents.reduce((sum, source) => sum + (source.data?.size ?? 0), 0),
    files: contents.length,
    sources,
  };
}

export function device_item(file: File): CreateItem {
  return {
    id: crypto.randomUUID(),
    name: file.name,
    directory: false,
    path: null,
    size: file.size,
    files: 1,
    sources: [{ name: file.name, data: file, modified: new Date(file.lastModified) }],
  };
}

export async function write_at(path: string, data: Blob): Promise<void> {
  const folder = parent_path(path);
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`The folder ${folder} no longer exists.`);
  await files().create_file(directory, base_name(path), { content: data, overwrite: true });
}

export async function remove_at(path: string): Promise<void> {
  const parent = await files().get_directory(parent_path(path));
  if (parent) await files().delete_entry(parent, base_name(path), { recursive: true });
}
