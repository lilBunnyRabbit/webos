import type { FilesService } from "$lib/core/api";
import { split_path } from "$lib/core/api/services/files/path";
import { app_data_path } from "$lib/core/contexts/app";
import { encode } from "./encode";
import type { Turn } from "./orientation";
import { APP_ID, expired, orphans, photo_file, picture_name, PHOTOS, THUMBS, without_photo, type Batch, type GlimpseIndex, type Photo } from "./photos";

export interface IndexHolder {
  value: GlimpseIndex;
}

export type BatchMeta = Omit<Batch, "photos">;

const PICTURES = "/home/Pictures";
const path_of = (folder: string, id: string) => app_data_path(APP_ID, `${folder}/${photo_file(id)}`);
const is_not_found = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

// One chain for every window in the tab: a save, an erase and the orphan sweep never interleave.
let queue: Promise<unknown> = Promise.resolve();
// Photo files written but not yet in the index; the sweep must not take them.
const writing = new Set<string>();

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => {});
  return run;
}

async function folder(files: FilesService, name: string): Promise<FileSystemDirectoryHandle> {
  let directory = await files.get_root();
  for (const segment of split_path(app_data_path(APP_ID, name))) {
    directory = (await files.exists(directory, segment, "directory"))
      ? await directory.getDirectoryHandle(segment)
      : await files.create_directory(directory, segment);
  }
  return directory;
}

async function remove(files: FilesService, ids: string[]): Promise<void> {
  for (const name of [PHOTOS, THUMBS]) {
    const directory = await files.get_directory(app_data_path(APP_ID, name));
    if (!directory) continue;
    for (const id of ids) {
      try {
        await files.delete_entry(directory, photo_file(id));
      } catch (error) {
        if (!is_not_found(error)) throw error;
      }
    }
  }
}

export function save_shot(files: FilesService, index: IndexHolder, batch: () => BatchMeta, frame: ImageBitmap, turn: Turn, id: string, taken: number): Promise<Photo> {
  writing.add(photo_file(id));
  return enqueue(async () => {
    try {
      const { photo, thumb, width, height } = await encode(frame, turn);
      await files.create_file(await folder(files, PHOTOS), photo_file(id), { content: photo, overwrite: true });
      await files.create_file(await folder(files, THUMBS), photo_file(id), { content: thumb, overwrite: true });
      const shot: Photo = { id, taken, width, height };
      const meta = batch();
      const existing = index.value.batches.find((entry) => entry.id === meta.id);
      if (existing) existing.photos.push(shot);
      else index.value.batches.push({ ...meta, photos: [shot] });
      return shot;
    } finally {
      writing.delete(photo_file(id));
    }
  });
}

export function erase_expired(files: FilesService, index: IndexHolder, now = Date.now()): Promise<number> {
  return enqueue(async () => {
    const gone = expired(index.value.batches, now);
    if (gone.length === 0) return 0;
    await remove(files, gone.flatMap((batch) => batch.photos.map((photo) => photo.id)));
    const ids = new Set(gone.map((batch) => batch.id));
    index.value.batches = index.value.batches.filter((batch) => !ids.has(batch.id));
    return gone.length;
  });
}

export function delete_batch(files: FilesService, index: IndexHolder, batch_id: string): Promise<void> {
  return enqueue(async () => {
    const batch = index.value.batches.find((entry) => entry.id === batch_id);
    if (!batch) return;
    await remove(files, batch.photos.map((photo) => photo.id));
    index.value.batches = index.value.batches.filter((entry) => entry.id !== batch_id);
  });
}

export function delete_photo(files: FilesService, index: IndexHolder, photo_id: string): Promise<void> {
  return enqueue(async () => {
    await remove(files, [photo_id]);
    index.value.batches = without_photo(index.value.batches, photo_id);
  });
}

// Another tab may be between writing a photo and listing it in its index; only files left this long are orphans.
const ORPHAN_GRACE_MS = 10 * 60_000;

export function clean_orphans(files: FilesService, index: IndexHolder, now = Date.now()): Promise<number> {
  return enqueue(async () => {
    let count = 0;
    for (const name of [PHOTOS, THUMBS]) {
      const directory = await files.get_directory(app_data_path(APP_ID, name));
      if (!directory) continue;
      const names = (await files.list(directory)).filter((item) => item.kind === "file").map((item) => item.name);
      for (const orphan of orphans(names, index.value.batches, writing)) {
        const file = await (await directory.getFileHandle(orphan)).getFile();
        if (now - file.lastModified < ORPHAN_GRACE_MS) continue;
        await files.delete_entry(directory, orphan);
        count++;
      }
    }
    return count;
  });
}

export const read_photo = (files: FilesService, id: string) => files.get_file(path_of(PHOTOS, id));
export const read_thumb = (files: FilesService, id: string) => files.get_file(path_of(THUMBS, id));

export async function save_to_pictures(files: FilesService, photo: Photo): Promise<string> {
  const file = await read_photo(files, photo.id);
  if (!file) throw new Error("The photo is gone");
  const directory = (await files.get_directory(PICTURES)) ?? (await files.create_directory(await files.get_directory("/home"), "Pictures"));
  const handle = await files.create_file(directory, picture_name(photo.taken), { content: file });
  return `${PICTURES}/${handle.name}`;
}
