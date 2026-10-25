import kernel, { type FilesService } from "$lib/core/api";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { parse_sketch } from "./format";
import type { Sketch } from "./model";

export async function read_path(path: string): Promise<Sketch> {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new Error(`File not found: ${path}`);
  return parse_sketch(await file.text());
}

export async function write_file(path: string, content: string | Blob): Promise<void> {
  const files = kernel.service<FilesService>("files");
  const folder = parent_path(path);
  const directory = await files.get_directory(folder);
  if (!directory) throw new Error(`Folder not found: ${folder}`);
  await files.create_file(directory, base_name(path), { content, overwrite: true });
}
