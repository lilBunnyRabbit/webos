import { describe, expect, it } from "vitest";
import type { Item } from "./api";
import { tally, type Holding } from "./goals";
import { build_inventory, find_rows, InventorySort, rarities, type_label, types } from "./inventory";

const ECTO = 19721;
const SWORD = 46774;

const holdings: Holding[] = [
  { label: "Bank", counts: tally([{ id: ECTO, count: 250 }]) },
  { label: "Aria", counts: tally([{ id: ECTO, count: 20 }, { id: SWORD, count: 1 }]) },
];
const equipped: Holding[] = [{ label: "Aria", counts: tally([{ id: SWORD, count: 1 }]) }];

const items = new Map<number, Item>([
  [ECTO, { id: ECTO, name: "Glob of Ectoplasm", icon: "", rarity: "Exotic", type: "CraftingMaterial" }],
  [SWORD, { id: SWORD, name: "Zojja's Blade", icon: "", rarity: "Ascended", type: "Weapon" }],
]);

describe("build_inventory", () => {
  it("sums each item across places, equipped marked", () => {
    const rows = build_inventory(holdings, equipped);
    expect(rows.find((row) => row.item_id === ECTO)).toEqual({
      item_id: ECTO,
      total: 270,
      places: [
        { label: "Bank", count: 250, equipped: false },
        { label: "Aria", count: 20, equipped: false },
      ],
    });
    expect(rows.find((row) => row.item_id === SWORD)?.places).toEqual([
      { label: "Aria", count: 1, equipped: false },
      { label: "Aria", count: 1, equipped: true },
    ]);
  });
});

describe("find_rows", () => {
  const rows = build_inventory(holdings, equipped);

  const ids = (filter: Parameters<typeof find_rows>[2]) => find_rows(rows, items, filter).map((row) => row.item_id);

  it("sorts rarest first by default, then by name or count", () => {
    expect(ids({ query: "" })).toEqual([SWORD, ECTO]);
    expect(ids({ query: "", sort: InventorySort.NAME })).toEqual([ECTO, SWORD]);
    expect(ids({ query: "", sort: InventorySort.COUNT })).toEqual([ECTO, SWORD]);
  });

  it("matches names case-insensitively and item ids", () => {
    expect(ids({ query: "ECTO" })).toEqual([ECTO]);
    expect(ids({ query: String(SWORD) })).toEqual([SWORD]);
  });

  it("filters by rarity and type", () => {
    expect(ids({ query: "", rarity: "Ascended" })).toEqual([SWORD]);
    expect(ids({ query: "", type: "CraftingMaterial" })).toEqual([ECTO]);
  });
});

it("lists rarities in game order", () => {
  expect(rarities(items)).toEqual(["Exotic", "Ascended"]);
});

it("lists types and labels them", () => {
  expect(types(items)).toEqual(["CraftingMaterial", "Weapon"]);
  expect(type_label("CraftingMaterial")).toBe("Crafting Material");
});
