import kernel, { type FilesService } from "$lib/core/api";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { EXTENSION, parse_notebook } from "./format";
import type { Notebook } from "./model";

export function with_extension(path: string): string {
  if (path.toLowerCase().endsWith(EXTENSION)) return path;
  return `${path.replace(/\.md$/i, "")}${EXTENSION}`;
}

export function file_name_for(title: string): string {
  return with_extension(title.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "Proposals");
}

export async function read_notebook(path: string): Promise<Notebook> {
  const file = await kernel.service<FilesService>("files").get_file(path);
  if (!file) throw new Error(`File not found: ${path}`);
  return parse_notebook(await file.text());
}

export async function write_file(path: string, content: string): Promise<void> {
  const files = kernel.service<FilesService>("files");
  const folder = parent_path(path);
  const directory = await files.get_directory(folder);
  if (!directory) throw new Error(`Folder not found: ${folder}`);
  await files.create_file(directory, base_name(path), { content, overwrite: true });
}

export const SendResult = { SHARED: "shared", SAVED: "saved", CANCELLED: "cancelled" } as const;
export type SendResult = (typeof SendResult)[keyof typeof SendResult];

export async function send_file(content: string, name: string): Promise<SendResult> {
  const file = new File([content], name, { type: "text/markdown" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return SendResult.SHARED;
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return SendResult.CANCELLED;
    }
  }
  const { save_to_device, DOWNLOAD } = await import("$lib/core/api/services/backup/backup");
  await save_to_device(DOWNLOAD, file, name);
  return SendResult.SAVED;
}
