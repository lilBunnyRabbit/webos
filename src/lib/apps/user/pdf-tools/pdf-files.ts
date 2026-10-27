import kernel, { type FilesService } from "$lib/core/api";
import type { SourceFile } from "$kit/components/drop-zone";
import { orientation } from "$kit/utils/exif";
import { load_image } from "$kit/utils/image";
import type { PdfImage } from "./pdf";
import { parse_signature_svg, signature_svg, type Signature } from "./stroke";
import { child_path, is_image_name } from "./naming";
import { base_name, parent_path } from "$lib/core/api/services/files/path";

export const SIGNATURES_DIR = "/home/Signatures";
export const PDF_ACCEPT = [".pdf", "application/pdf"];
export const IMAGE_ACCEPT = ["image/*"];

function files(): FilesService {
  return kernel.service<FilesService>("files");
}

export async function read_bytes(source: SourceFile): Promise<Uint8Array> {
  return new Uint8Array(await source.file.arrayBuffer());
}

export async function write_at(path: string, data: Uint8Array | Blob | string): Promise<void> {
  const folder = parent_path(path);
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`The folder ${folder} no longer exists.`);
  await files().create_file(directory, base_name(path), {
    content: data instanceof Uint8Array ? new Blob([data as BlobPart]) : data,
    overwrite: true,
  });
}

export async function write_into(folder: string, name: string, data: Uint8Array | Blob | string): Promise<string> {
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`The folder ${folder} no longer exists.`);
  const handle = await files().create_file(directory, name, {
    content: data instanceof Uint8Array ? new Blob([data as BlobPart]) : data,
  });
  return child_path(folder, handle.name);
}

export function is_pdf(source: SourceFile): boolean {
  return source.file.type === "application/pdf" || source.name.toLowerCase().endsWith(".pdf");
}

export function is_image(source: SourceFile): boolean {
  return source.file.type.startsWith("image/") || is_image_name(source.name);
}

// PNG and JPEG go in as they are; anything else the browser can decode is redrawn to PNG first.
export async function prepare_image(source: SourceFile): Promise<PdfImage> {
  const typed = source.file.type
    ? source.file
    : new File([source.file], source.name, { type: guess_type(source.name) });
  const image = await load_image(typed, source.path);
  const { width, height } = image.bitmap;
  try {
    if (typed.type === "image/png" || typed.type === "image/jpeg") {
      const bytes = new Uint8Array(await typed.arrayBuffer());
      const jpeg = typed.type === "image/jpeg";
      return { bytes, kind: jpeg ? "jpg" : "png", width, height, orientation: jpeg ? orientation(bytes) : 1 };
    }
    const canvas = new OffscreenCanvas(width, height);
    canvas.getContext("2d")!.drawImage(image.bitmap, 0, 0);
    const blob = await canvas.convertToBlob({ type: "image/png" });
    return { bytes: new Uint8Array(await blob.arrayBuffer()), kind: "png", width, height };
  } finally {
    image.bitmap.close();
  }
}

function guess_type(name: string): string {
  const extension = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
  return extension === "jpg" ? "image/jpeg" : extension === "svg" ? "image/svg+xml" : `image/${extension}`;
}

export interface SavedSignature {
  name: string;
  path: string;
  signature: Signature;
}

export async function signatures_dir(create: boolean): Promise<FileSystemDirectoryHandle | null> {
  const existing = await files().get_directory(SIGNATURES_DIR);
  if (existing || !create) return existing;
  const home = await files().get_directory(parent_path(SIGNATURES_DIR));
  if (!home) throw new Error("The home folder is missing.");
  await files().create_directory(home, base_name(SIGNATURES_DIR));
  return files().get_directory(SIGNATURES_DIR);
}

export async function list_signatures(): Promise<SavedSignature[]> {
  const directory = await signatures_dir(false);
  if (!directory) return [];
  const out: SavedSignature[] = [];
  for (const item of await files().list(directory)) {
    if (item.kind !== "file" || !item.name.toLowerCase().endsWith(".svg")) continue;
    const signature = parse_signature_svg(await (await item.handle.getFile()).text());
    if (signature) out.push({ name: item.name, path: child_path(SIGNATURES_DIR, item.name), signature });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function save_signature(name: string, signature: Signature): Promise<string> {
  await signatures_dir(true);
  return write_into(SIGNATURES_DIR, name, signature_svg(signature));
}

export async function rename_signature(name: string, new_name: string): Promise<void> {
  await files().rename_entry(await signatures_dir(false), name, new_name);
}

export async function delete_signature(name: string): Promise<void> {
  await files().delete_entry(await signatures_dir(false), name);
}
