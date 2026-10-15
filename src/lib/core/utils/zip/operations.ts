import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { format_bytes } from "$lib/core/utils";
import { extract_entries, item_at, join, remove_at, write_at, type ExtractResult } from "./files";
import { add_item, all_sources, archive_name, base_name, stem, unique_name, type CreateItem } from "./create";
import { ArchiveJob } from "./job.svelte";
import { Method } from "./format";
import { read_zip, type ZipEntry } from "./read";
import { write_zip, type ZipSource } from "./write";

// Explorer's Compress and Extract here are an OS feature, so their notifications come from it unless a caller names its app.
const SENDER: AppId = "file-explorer";

export interface RunOptions {
  app_id?: AppId;
  signal?: AbortSignal;
  on_job?: (job: ArchiveJob | null) => void;
}

const files = () => kernel.service<FilesService>("files");
const apps = () => kernel.service<AppsService>("apps");

export async function items_at(paths: string[]): Promise<CreateItem[]> {
  let items: CreateItem[] = [];
  for (const path of paths) {
    const item = await item_at(path);
    if (!item) throw new Error(`${path}: no such file or folder`);
    items = add_item(items, item);
  }
  return items;
}

export async function free_path(folder: string, name: string): Promise<string> {
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`${folder}: no such folder`);
  const taken = new Set((await files().list(directory)).map((item) => item.name));
  return join(folder, unique_name(name, taken));
}

export async function zip_sources(sources: ZipSource[], total: number, target: string, method: Method, options: RunOptions = {}): Promise<string | null> {
  const existed = (await files().get_file(target)) !== null;
  const job = new ArchiveJob(options.app_id ?? SENDER, { title: `Compressing ${base_name(target)}`, cancelled: "Compression cancelled", failed: "Couldn't create the archive" }, total, options.signal);
  options.on_job?.(job);
  try {
    return await job.run(async (stream) => {
      const zip = await write_zip(sources, { method, ...stream });
      if (!existed) job.wrote({ path: target, discard: () => remove_at(target) });
      await write_at(target, zip);
      return {
        title: "Archive saved",
        message: `${target} · ${format_bytes(zip.size)}`,
        actions: [{ label: "Open", on_click: () => void apps().open(target) }],
        result: target,
      };
    });
  } finally {
    options.on_job?.(null);
  }
}

export async function zip_items(items: CreateItem[], target: string, method: Method = Method.DEFLATE, options: RunOptions = {}): Promise<string | null> {
  const total = items.reduce((sum, item) => sum + item.size, 0);
  return zip_sources(all_sources(items), total, target, method, options);
}

export async function compress_into(paths: string[], folder: string): Promise<string | null> {
  const items = await items_at(paths);
  return zip_items(items, await free_path(folder, archive_name(items)));
}

export async function extract_blob(blob: Blob, name: string, entries: ZipEntry[], folder: string, options: RunOptions = {}): Promise<ExtractResult | null> {
  const total = entries.reduce((sum, entry) => sum + (entry.directory ? 0 : entry.size), 0);
  const job = new ArchiveJob(options.app_id ?? SENDER, { title: `Extracting ${name}`, cancelled: "Extraction cancelled", failed: "Couldn't extract the archive" }, total, options.signal);
  options.on_job?.(job);
  try {
    return await job.run(async (stream) => {
      const result = await extract_entries(blob, entries, folder, stem(name), stream, (path) => job.wrote({ path, discard: () => remove_at(path) }));
      const skipped = result.skipped.length ? ` · ${result.skipped.length} skipped (encrypted or unsupported)` : "";
      return {
        title: `Extracted ${result.files} ${result.files === 1 ? "file" : "files"}`,
        message: `${result.path}${skipped}`,
        actions: [{ label: "Show folder", on_click: () => apps().launch("file-explorer", { path: result.path }) }],
        result,
      };
    });
  } finally {
    options.on_job?.(null);
  }
}

export async function extract_to(path: string, folder: string, options: RunOptions = {}): Promise<ExtractResult | null> {
  const file = await files().get_file(path);
  if (!file) throw new Error(`${path}: no such file`);
  const archive = await read_zip(file);
  return extract_blob(file, base_name(path), archive.entries, folder, options);
}
