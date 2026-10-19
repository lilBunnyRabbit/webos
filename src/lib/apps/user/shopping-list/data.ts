import { z } from "zod";

/**
 * Shopping List's file, `/var/lib/apps/shopping-list/lists.json`: every list, its items and the purchase history.
 *
 * Items are never removed straight away: a deleted one keeps `deleted_at` for `TOMBSTONE_MS`, so a paired device that
 * still has it learns it's gone instead of adding it back. Every change bumps `updated_at`; a sync keeps the newer one.
 */

export const APP_ID = "shopping-list";
export const LISTS_FILE = "lists.json";
export const LISTS_VERSION = 1;
export const TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;

export const ListColor = {
  PRIMARY: "primary",
  SECONDARY: "secondary",
  TERTIARY: "tertiary",
  ACCENT: "accent",
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
} as const;
export type ListColor = (typeof ListColor)[keyof typeof ListColor];
export const LIST_COLORS = Object.values(ListColor);

const Id = z.string().min(1);

export const ItemSchema = z.object({
  id: Id,
  text: z.string(),
  qty: z.number().positive().optional(),
  unit: z.string().min(1).optional(),
  checked: z.boolean(),
  updated_at: z.number(),
  deleted_at: z.number().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const ListMetaSchema = z.object({ id: Id, name: z.string(), color: z.enum(ListColor) });
export type ListMeta = z.infer<typeof ListMetaSchema>;

export const ListSchema = ListMetaSchema.extend({ items: z.array(ItemSchema) });
export type List = z.infer<typeof ListSchema>;

/** Keyed by the item's text in lower case. `last` is when it was last bought: the "Clear done" of that trip. */
export const HistoryEntrySchema = z.object({ count: z.number().int().min(0), last: z.number() });
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type History = Record<string, HistoryEntry>;

export const ListsFileSchema = z.object({
  version: z.literal(LISTS_VERSION),
  lists: z.array(ListSchema),
  history: z.record(z.string(), HistoryEntrySchema),
});
export type ListsFile = z.infer<typeof ListsFileSchema>;

export const DEFAULT_LIST_ID = "groceries";

export function empty_file(): ListsFile {
  return {
    version: LISTS_VERSION,
    lists: [{ id: DEFAULT_LIST_ID, name: "Groceries", color: ListColor.PRIMARY, items: [] }],
    history: {},
  };
}

/** Time first, so sorting by id is the order items were added in, on any device. */
export function new_id(now = Date.now()): string {
  const random = Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${now.toString(36).padStart(9, "0")}-${random}`;
}

/** Never goes back in time for one item, even when this device's clock is behind the one that last changed it. */
export function stamp(previous?: Item, now = Date.now()): number {
  return Math.max(now, (previous?.updated_at ?? 0) + 1);
}

export const history_key = (text: string) => text.trim().toLocaleLowerCase();

export function next_color(lists: readonly ListMeta[]): ListColor {
  const used = new Set(lists.map((list) => list.color));
  return LIST_COLORS.find((color) => !used.has(color)) ?? LIST_COLORS[lists.length % LIST_COLORS.length];
}
