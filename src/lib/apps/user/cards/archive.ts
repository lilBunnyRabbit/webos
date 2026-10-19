import { Method } from "$lib/core/utils/zip/format";
import { entry_blob, read_zip } from "$lib/core/utils/zip/read";
import { write_zip, type ZipSource } from "$lib/core/utils/zip/write";
import { CARDS_FILE, CardsFileSchema, PhotoSide, type Card, type CardsFile } from "./data";

export const ARCHIVE_NAME = "Cards.zip";

export function archive_photo_name(id: string, side: PhotoSide): string {
  return `photos/${id}-${side}.webp`;
}

export type PhotoBlobs = Map<string, Blob>;

export function build_archive(file: CardsFile, photos: PhotoBlobs): Promise<Blob> {
  const sources: ZipSource[] = [{ name: CARDS_FILE, data: new Blob([JSON.stringify(file, null, 2) + "\n"], { type: "application/json" }) }];
  for (const [name, data] of photos) sources.push({ name, data });
  return write_zip(sources, { method: Method.DEFLATE });
}

export interface ReadArchive {
  cards: Card[];
  photos: PhotoBlobs;
}

export async function read_archive(blob: Blob): Promise<ReadArchive> {
  const archive = await read_zip(blob);
  const list = archive.entries.find((entry) => !entry.directory && entry.name === CARDS_FILE);
  if (!list) throw new Error(`This isn't a Cards export: it has no ${CARDS_FILE}`);
  const parsed = CardsFileSchema.safeParse(JSON.parse(await (await entry_blob(blob, list)).text()));
  if (!parsed.success) throw new Error(`${CARDS_FILE} in this file isn't valid Cards data`);

  const wanted = new Set(parsed.data.cards.flatMap((card) => Object.values(PhotoSide).filter((side) => card.photos[side]).map((side) => archive_photo_name(card.id, side))));
  const photos: PhotoBlobs = new Map();
  for (const entry of archive.entries) {
    if (!entry.directory && wanted.has(entry.name)) photos.set(entry.name, await entry_blob(blob, entry));
  }
  return { cards: parsed.data.cards, photos };
}

/** Imported cards get fresh ids, so they never collide with one already here; photo flags follow what the file holds. */
export function adopt_cards(cards: readonly Card[], photos: PhotoBlobs, new_id: () => string): { card: Card; photos: Partial<Record<PhotoSide, Blob>> }[] {
  return cards.map((card) => {
    const own: Partial<Record<PhotoSide, Blob>> = {};
    for (const side of Object.values(PhotoSide)) {
      const blob = card.photos[side] ? photos.get(archive_photo_name(card.id, side)) : undefined;
      if (blob) own[side] = blob;
    }
    return { card: { ...card, id: new_id(), photos: { front: Boolean(own.front), back: Boolean(own.back) } }, photos: own };
  });
}
