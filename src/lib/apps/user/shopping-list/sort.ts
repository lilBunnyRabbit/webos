import type { Item } from "./data";

export const ItemSort = {
  OLDEST: "oldest",
  NEWEST: "newest",
  NAME: "name",
  NAME_DESC: "name-desc",
} as const;
export type ItemSort = (typeof ItemSort)[keyof typeof ItemSort];

export const SORT_LABELS: Record<ItemSort, string> = {
  [ItemSort.OLDEST]: "Oldest first",
  [ItemSort.NEWEST]: "Newest first",
  [ItemSort.NAME]: "Name A–Z",
  [ItemSort.NAME_DESC]: "Name Z–A",
};

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

const by_added = (a: Item, b: Item) => a.added_at - b.added_at;

/** Ties keep the incoming order. */
export function sort_items(items: readonly Item[], sort: ItemSort): Item[] {
  const sorted = [...items];
  if (sort === ItemSort.OLDEST) return sorted.sort(by_added);
  if (sort === ItemSort.NEWEST) return sorted.sort((a, b) => by_added(b, a));
  const direction = sort === ItemSort.NAME ? 1 : -1;
  return sorted.sort((a, b) => direction * collator.compare(a.text, b.text) || by_added(a, b));
}
