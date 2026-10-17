import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { strip_metadata, stripped_name } from "./strip";

export const APP_ID = "metadata";

const files = () => kernel.service<FilesService>("files");

export const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

export function is_inspectable_name(name: string): boolean {
  return /\.(jpe?g|png|webp|pdf)$/i.test(name);
}

export interface Stripped {
  path: string;
  removed: number;
}

export async function strip_beside(path: string, keep_orientation: boolean): Promise<Stripped> {
  const file = await files().get_file(path);
  if (!file) throw new Error(`${path} no longer exists.`);
  const result = strip_metadata(new Uint8Array(await file.arrayBuffer()), { keep_orientation });
  const folder = parent_path(path);
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`The folder ${folder} no longer exists.`);
  const handle = await files().create_file(directory, stripped_name(base_name(path)), { content: new Blob([result.bytes as BlobPart]) });
  return { path: child_path(folder, handle.name), removed: result.removed };
}

export async function write_at(path: string, bytes: Uint8Array): Promise<void> {
  const folder = parent_path(path);
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`The folder ${folder} no longer exists.`);
  await files().create_file(directory, base_name(path), { content: new Blob([bytes as BlobPart]), overwrite: true });
}

export function open_in_hex(path: string, offset = 0): void {
  kernel.service<AppsService>("apps").launch("hex-viewer", { path, offset });
}
