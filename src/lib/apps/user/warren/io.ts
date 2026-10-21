import kernel, { type FilesService } from "$lib/core/api";
import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
import { BUILTIN_FONTS, FONT_DIRECTORY } from "$lib/core/api/services/settings/fonts";
import type { FontChoice } from "$lib/core/api/services/settings/type";
import { fetch_faces, file_faces, type FaceSource } from "$lib/core/utils/font-loader";
import { EXTENSION, parse_document, type WarrenDocument } from "./format";

export function with_extension(path: string, extension: string): string {
  return path.toLowerCase().endsWith(extension) ? path : `${path}${extension}`;
}

export function document_file_name(name: string): string {
  return with_extension(file_stem(name) || "Untitled", EXTENSION);
}

export function stem_of(path: string): string {
  const name = base_name(path);
  return name.toLowerCase().endsWith(EXTENSION) ? name.slice(0, -EXTENSION.length) : file_stem(name);
}

export async function read_file(path: string): Promise<File> {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new Error(`File not found: ${path}`);
  return file;
}

export async function font_sources(choice: Exclude<FontChoice, { kind: "default" }>): Promise<FaceSource[]> {
  if (choice.kind === "builtin") {
    const font = BUILTIN_FONTS[choice.id];
    if (!font) throw new Error(`${choice.id} isn't a built-in font`);
    return fetch_faces(font.faces);
  }
  const file = await kernel.service<FilesService>("files").get_file(`${FONT_DIRECTORY}/${choice.name}`);
  if (!file) throw new Error(`${choice.name} isn't in ${FONT_DIRECTORY} any more`);
  return file_faces(new Uint8Array(await file.arrayBuffer()));
}

export async function read_document(path: string): Promise<WarrenDocument> {
  return parse_document(await (await read_file(path)).text());
}

export async function write_file(path: string, content: string | Blob): Promise<void> {
  const files = kernel.service<FilesService>("files");
  const folder = parent_path(path);
  const directory = await files.get_directory(folder);
  if (!directory) throw new Error(`Folder not found: ${folder}`);
  await files.create_file(directory, base_name(path), { content, overwrite: true });
}
