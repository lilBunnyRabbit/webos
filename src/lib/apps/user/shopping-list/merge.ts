import { TOMBSTONE_MS, type Item } from "./data";

export function item_key(item: Item): string {
  return JSON.stringify([item.id, item.text, item.qty ?? null, item.unit ?? null, item.checked, item.updated_at, item.deleted_at ?? null]);
}

/** The newer of two versions of one item. Equal stamps from two devices need a rule both pick the same way. */
export function newer(a: Item, b: Item): Item {
  if (a.updated_at !== b.updated_at) return a.updated_at > b.updated_at ? a : b;
  return item_key(a) >= item_key(b) ? a : b;
}

const by_id = (a: Item, b: Item) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * Every item from both sides, each at its newest version, deletions included. Sorted by id (time of adding), so both
 * devices end up with the same list in the same order, whichever merges first.
 */
export function merge_items(local: readonly Item[], remote: readonly Item[]): Item[] {
  const merged = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const mine = merged.get(item.id);
    merged.set(item.id, mine ? newer(mine, item) : item);
  }
  return [...merged.values()].sort(by_id);
}

/** Deletions older than `TOMBSTONE_MS` are dropped; a device that was apart longer than that may bring them back. */
export function prune(items: readonly Item[], now = Date.now()): Item[] {
  return items.filter((item) => item.deleted_at === undefined || now - item.deleted_at <= TOMBSTONE_MS);
}

export const live = (items: readonly Item[]) => items.filter((item) => item.deleted_at === undefined);
