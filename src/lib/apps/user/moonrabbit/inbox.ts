import type { FilesService } from "$lib/core/api";
import { z } from "zod";
import { open_inbox, random_id, seal_inbox, type JournalHeader } from "./crypto";
import { INBOX_DIR, type Entry } from "./journal";
import { child, remove_bin, write_bin, type JournalRef } from "./store";

export const InboxItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  created: z.number(),
  body: z.string().max(20_000),
  mood: z.number().int().min(1).max(5).optional(),
});
export type InboxItem = z.infer<typeof InboxItemSchema>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITEM_FILE = /^([0-9a-f]{32})\.bin$/;

export function inbox_path(ref: JournalRef): string {
  return child(ref.path, INBOX_DIR);
}

export function inbox_id(name: string): string | null {
  return ITEM_FILE.exec(name)?.[1] ?? null;
}

/** Needs no unlock: only the header's public key. Returns the item's id, which becomes its entry's id on merge. */
export async function add_to_inbox(
  files: FilesService,
  ref: JournalRef & { header: JournalHeader },
  item: InboxItem
): Promise<string> {
  const id = random_id();
  const bytes = await seal_inbox(ref.header, id, encoder.encode(JSON.stringify(InboxItemSchema.parse(item))));
  await write_bin(files, inbox_path(ref), `${id}.bin`, bytes);
  return id;
}

export function remove_from_inbox(files: FilesService, ref: JournalRef, id: string): Promise<void> {
  return remove_bin(files, inbox_path(ref), `${id}.bin`);
}

export async function read_inbox_item(
  header: JournalHeader,
  private_key: CryptoKey,
  id: string,
  bytes: Uint8Array<ArrayBuffer>
): Promise<Entry> {
  const item = InboxItemSchema.parse(JSON.parse(decoder.decode(await open_inbox(header, private_key, id, bytes))));
  return {
    id,
    date: item.date,
    created: item.created,
    updated: item.created,
    body: item.body,
    ...(item.mood ? { mood: item.mood } : {}),
  };
}
