import type { FilesService } from "$lib/core/api";
import type { FileSystemFileItem } from "$lib/core/api/services/files/type";
import { is_media_file, RECORDINGS_DIR } from "./media";

export async function list_recordings(files: FilesService): Promise<FileSystemFileItem[]> {
  const directory = await files.get_directory(RECORDINGS_DIR);
  const items = directory ? await files.list(directory, { include_metadata: true }) : [];
  const media = items.filter((item): item is FileSystemFileItem => item.kind === "file" && is_media_file(item.name));
  return media.sort((a, b) => (b.last_modified ?? 0) - (a.last_modified ?? 0));
}
