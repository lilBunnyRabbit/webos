import { fit_within } from "$kit/utils/qr";
import { z } from "zod";

export const QrEntry = z.object({
  id: z.string(),
  content: z.string(),
  image_url: z.string(),
  scanned_at: z.number(),
});
export type QrEntry = z.infer<typeof QrEntry>;

export const QrEntries = z.array(QrEntry);

// Every entry carries a PNG thumbnail inline, and each scan rewrites the whole list.
export const HISTORY_LIMIT = 50;

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  entries: QrEntries.catch([]),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { entries: [] };
}

const THUMBNAIL_SIZE = 200;

/** A PNG data URL of `source` scaled down to fit a 200px square, small enough to keep in app storage. */
export function thumbnail(source: CanvasImageSource, width: number, height: number): string {
  const size = fit_within(width, height, THUMBNAIL_SIZE);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  canvas.getContext("2d")?.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export function is_url(text: string): boolean {
  try {
    const { protocol } = new URL(text);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}
