import type { FilesService } from "$lib/core/api";
import { split_path } from "$lib/core/api/services/files/path";
import { app_data_path } from "$lib/core/contexts/app";
import { fit_within } from "$kit/utils/qr";
import { load_image } from "$kit/utils/image";
import { CARDS_APP_ID, PhotoSide } from "./data";

export const PHOTOS_DIR = app_data_path(CARDS_APP_ID, "photos");

const MAX_SIDE = 1600;
const QUALITY = 0.85;

export function photo_name(id: string, side: PhotoSide): string {
  return `${id}-${side}.webp`;
}

export async function encode_photo(file: File): Promise<Blob> {
  const { bitmap } = await load_image(file);
  try {
    const { width, height } = fit_within(bitmap.width, bitmap.height, MAX_SIDE);
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: "image/webp", quality: QUALITY });
  } finally {
    bitmap.close();
  }
}

async function photos_directory(files: FilesService): Promise<FileSystemDirectoryHandle> {
  let directory = await files.get_root();
  for (const segment of split_path(PHOTOS_DIR)) {
    directory = (await files.exists(directory, segment, "directory"))
      ? await directory.getDirectoryHandle(segment)
      : await files.create_directory(directory, segment);
  }
  return directory;
}

export async function write_photo(files: FilesService, id: string, side: PhotoSide, photo: Blob): Promise<void> {
  await files.create_file(await photos_directory(files), photo_name(id, side), { content: photo, overwrite: true });
}

export function read_photo(files: FilesService, id: string, side: PhotoSide): Promise<File | null> {
  return files.get_file(`${PHOTOS_DIR}/${photo_name(id, side)}`);
}

export async function delete_photo(files: FilesService, id: string, side: PhotoSide): Promise<void> {
  const directory = await files.get_directory(PHOTOS_DIR);
  const name = photo_name(id, side);
  if (directory && (await files.exists(directory, name, "file"))) await files.delete_entry(directory, name);
}

export async function delete_photos(files: FilesService, id: string): Promise<void> {
  await Promise.all(Object.values(PhotoSide).map((side) => delete_photo(files, id, side)));
}
