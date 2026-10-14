import type { FilesService } from "$lib/core/api";
import { split_path } from "$lib/core/api/services/files/path";
import { app_data_path } from "$lib/core/contexts/app";

export const APP_ID = "soundboard";
export const SOUNDS_DIR = app_data_path(APP_ID, "sounds");

async function sounds_directory(files: FilesService): Promise<FileSystemDirectoryHandle> {
  let directory = await files.get_root();
  for (const segment of split_path(SOUNDS_DIR)) {
    directory = (await files.exists(directory, segment, "directory"))
      ? await directory.getDirectoryHandle(segment)
      : await files.create_directory(directory, segment);
  }
  return directory;
}

export async function import_sound(files: FilesService, file: File): Promise<string> {
  const handle = await files.create_file(await sounds_directory(files), file.name || "sound", { content: file });
  return handle.name;
}

export function read_sound(files: FilesService, name: string): Promise<File | null> {
  return files.get_file(`${SOUNDS_DIR}/${name}`);
}

export async function delete_sound(files: FilesService, name: string): Promise<void> {
  const directory = await files.get_directory(SOUNDS_DIR);
  if (!directory || !(await files.exists(directory, name, "file"))) return;
  await files.delete_entry(directory, name);
}
