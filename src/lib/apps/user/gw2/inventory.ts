import type { Item } from "./api";
import type { Holding } from "./goals";

const RARITY_ORDER = ["Junk", "Basic", "Fine", "Masterwork", "Rare", "Exotic", "Ascended", "Legendary"];

// The game's own rarity colours: an owner-approved exception to theme tokens, since players read rarity by them.
export const RARITY_COLORS: Record<string, string> = {
  Junk: "#aaaaaa",
  Fine: "#62a4da",
  Masterwork: "#1a9306",
  Rare: "#fcd00b",
  Exotic: "#ffa405",
  Ascended: "#fb3e8d",
  Legendary: "#4c139d",
};

export interface Place {
  label: string;
  count: number;
  equipped: boolean;
}

export interface InventoryRow {
  item_id: number;
  total: number;
  places: Place[];
}

export function build_inventory(holdings: readonly Holding[], equipped: readonly Holding[] = []): InventoryRow[] {
  const rows = new Map<number, InventoryRow>();
  const add = (holding: Holding, is_equipped: boolean) => {
    for (const [item_id, count] of holding.counts) {
      let row = rows.get(item_id);
      if (!row) rows.set(item_id, (row = { item_id, total: 0, places: [] }));
      row.total += count;
      row.places.push({ label: holding.label, count, equipped: is_equipped });
    }
  };
  for (const holding of holdings) add(holding, false);
  for (const holding of equipped) add(holding, true);
  return [...rows.values()];
}

export const InventorySort = { RARITY: "rarity", NAME: "name", COUNT: "count" } as const;
export type InventorySort = (typeof InventorySort)[keyof typeof InventorySort];

export interface InventoryFilter {
  query: string;
  rarity?: string;
  type?: string;
  sort?: InventorySort;
}

const rank = (rarity: string | undefined) => (rarity ? RARITY_ORDER.indexOf(rarity) : -1);

export function find_rows(rows: readonly InventoryRow[], items: ReadonlyMap<number, Item>, filter: InventoryFilter): InventoryRow[] {
  const needle = filter.query.trim().toLowerCase();
  const id = /^\d+$/.test(needle) ? Number(needle) : null;
  const name = (row: InventoryRow) => items.get(row.item_id)?.name ?? "";
  const by_name = (a: InventoryRow, b: InventoryRow) => name(a).localeCompare(name(b)) || a.item_id - b.item_id;
  const compare = {
    [InventorySort.RARITY]: (a: InventoryRow, b: InventoryRow) =>
      rank(items.get(b.item_id)?.rarity) - rank(items.get(a.item_id)?.rarity) || by_name(a, b),
    [InventorySort.NAME]: by_name,
    [InventorySort.COUNT]: (a: InventoryRow, b: InventoryRow) => b.total - a.total || by_name(a, b),
  }[filter.sort ?? InventorySort.RARITY];
  return rows
    .filter((row) => {
      const item = items.get(row.item_id);
      if (filter.rarity && item?.rarity !== filter.rarity) return false;
      if (filter.type && item?.type !== filter.type) return false;
      if (!needle) return true;
      return row.item_id === id || name(row).toLowerCase().includes(needle);
    })
    .sort(compare);
}

export function rarities(items: ReadonlyMap<number, Item>): string[] {
  const found = new Set([...items.values()].map((item) => item.rarity));
  return [...found].sort((a, b) => (rank(a) + 1 || 99) - (rank(b) + 1 || 99));
}

export function types(items: ReadonlyMap<number, Item>): string[] {
  return [...new Set([...items.values()].map((item) => item.type))].sort();
}

export function type_label(type: string): string {
  return type.replace(/([a-z])([A-Z])/g, "$1 $2");
}
