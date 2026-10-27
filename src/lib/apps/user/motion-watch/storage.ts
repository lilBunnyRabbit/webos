import kernel, { type FilesService } from "$lib/core/api";
import { join_path, split_path } from "$lib/core/api/services/files/path";
import { clip_name, day_of, EVENTS_FILE, expired_days, is_day, MOTION_DIR, parse_events, serialize_events, type MotionEvent } from "./events";
import type { Clip } from "./watch.worker";

const files = () => kernel.service<FilesService>("files");
const is_not_found = (error: unknown) => error instanceof DOMException && error.name === "NotFoundError";

async function folder(path: string): Promise<FileSystemDirectoryHandle> {
  let directory = await files().get_root();
  for (const segment of split_path(path)) {
    try {
      directory = await directory.getDirectoryHandle(segment);
    } catch (error) {
      if (!is_not_found(error)) throw error;
      // Through FilesService, so Explorer windows on the parent see it.
      directory = await files().create_directory(directory, segment);
    }
  }
  return directory;
}

export const day_path = (day: string) => join_path([...split_path(MOTION_DIR), day]);
export const clip_path = (day: string, clip: string) => join_path([...split_path(MOTION_DIR), day, clip]);

export async function read_day(day: string): Promise<MotionEvent[]> {
  const file = await files().get_file(join_path([...split_path(MOTION_DIR), day, EVENTS_FILE]));
  return parse_events(file ? await file.text() : null);
}

export async function list_days(): Promise<string[]> {
  const directory = await files().get_directory(MOTION_DIR);
  if (!directory) return [];
  const items = await files().list(directory);
  return items.filter((item) => item.kind === "directory" && is_day(item.name)).map((item) => item.name).sort();
}

let queue: Promise<unknown> = Promise.resolve();

/** Writes the clip and adds it to its day's events. Saves run one at a time, so two clips never race on events.json. */
export function save_clip(clip: Clip): Promise<MotionEvent> {
  const saving = queue.then(async () => {
    const day = day_of(clip.at);
    const directory = await folder(day_path(day));
    const video = await files().create_file(directory, clip_name(clip.at));
    await files().write_file(video, clip.blob);
    const event: MotionEvent = { at: clip.at, end: clip.end, peak: clip.peak, cells: clip.cells, clip: video.name };
    const events = [...(await read_day(day)), event];
    const index = await files().create_file(directory, EVENTS_FILE, { overwrite: true });
    await files().write_file(index, serialize_events(events));
    return event;
  });
  queue = saving.catch(() => {});
  return saving;
}

export async function prune_days(keep_days: number, now = Date.now()): Promise<string[]> {
  const expired = expired_days(await list_days(), day_of(now), keep_days);
  const directory = expired.length > 0 ? await files().get_directory(MOTION_DIR) : null;
  for (const day of expired) await files().delete_entry(directory, day, { recursive: true });
  return expired;
}
