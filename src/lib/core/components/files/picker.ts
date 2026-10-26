import kernel, { association_tier, type FilesService } from "$lib/core/api";
import type { FileSystemItem } from "$lib/core/api/services/files";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { get_directory_handle } from "$lib/core/api/services/files/opfs";
import { pick_device_files } from "$lib/core/utils/device-file";
import type { PasteFile } from "../clipboard/paste";

/** File Explorer in picker mode (ADR-025): a window sheet that returns a path instead of opening things. */
export interface PickerMode {
  /** `save` picks a folder plus a file name, which may be new or an existing file to replace. */
  kind: "file" | "directory" | "save";
  /** Extensions (".md") or MIME patterns ("image/*"), the same syntax as app associations. Empty = anything. */
  accept?: string[];
  /** Save mode: the suggested file name. */
  name?: string;
  /** File mode: several files from one folder (Ctrl/Shift-click, Mod+A; a tap toggles on touch). */
  multiple?: boolean;
  /** One path, except a `multiple` file pick, which may choose several. */
  onchoose: (paths: string[]) => void;
  oncancel: () => void;
}

export function accepts(picker: PickerMode, item: FileSystemItem): boolean {
  if (item.kind === "directory") return picker.kind === "directory";
  if (picker.kind === "directory") return false;
  if (!picker.accept?.length) return true;
  return picker.accept.some((entry) => association_tier(entry, { name: item.name, type: item.type ?? "" }) > 0);
}

/** Where "This device…" puts what it picks; emptied with the rest of /tmp at every boot (ADR-044). */
export const DEVICE_PATH = `${PATHS.tmp}/device`;

/**
 * The browser's file chooser, copied into `DEVICE_PATH` so the pick has a path like any other: the picker's
 * `onchoose(paths)` stays one shape. Resolves the new paths, `[]` on cancel.
 */
export async function import_device_files(accept?: string[], multiple = false): Promise<string[]> {
  return store_device_files(kernel.service<FilesService>("files"), await pick_device_files({ accept, multiple }));
}

export async function store_device_files(files: FilesService, picked: File[]): Promise<string[]> {
  if (picked.length === 0) return [];
  const tmp = await files.get_directory(PATHS.tmp);
  if (!tmp) throw new Error(`${PATHS.tmp} doesn't exist`);
  await get_directory_handle(tmp, "device", { create: true });
  return files.import_entries(DEVICE_PATH, picked);
}

/** Pasted files as picker paths: WebOS copies keep their own, device data lands in `DEVICE_PATH` (ADR-076). */
export async function pasted_paths(items: PasteFile[]): Promise<string[]> {
  const device = items.filter((item) => item.path === null).map((item) => item.file);
  const stored = await store_device_files(kernel.service<FilesService>("files"), device);
  return [...items.flatMap((item) => (item.path === null ? [] : [item.path])), ...stored];
}
