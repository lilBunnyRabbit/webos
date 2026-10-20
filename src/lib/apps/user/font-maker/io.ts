import kernel, { type FilesService } from "$lib/core/api";
import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
import { EXTENSION, parse_project } from "./format";
import type { FontProject } from "./model";

export function with_extension(path: string, extension: string): string {
  return path.toLowerCase().endsWith(extension) ? path : `${path}${extension}`;
}

export function project_file_name(name: string): string {
  return with_extension(file_stem(name) || "Untitled", EXTENSION);
}

export async function read_project(path: string): Promise<FontProject> {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new Error(`File not found: ${path}`);
  return parse_project(await file.text());
}

export async function write_file(path: string, content: string | Blob): Promise<void> {
  const files = kernel.service<FilesService>("files");
  const folder = parent_path(path);
  const directory = await files.get_directory(folder);
  if (!directory) throw new Error(`Folder not found: ${folder}`);
  await files.create_file(directory, base_name(path), { content, overwrite: true });
}
