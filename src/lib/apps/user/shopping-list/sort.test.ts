import { describe, expect, test } from "vitest";
import type { Item } from "./data";
import { ItemSort, sort_items } from "./sort";

const item = (id: string, text: string, added_at: number): Item => ({ id, text, checked: false, added_at, updated_at: added_at });

const ids = (items: Item[]) => items.map((each) => each.id);

describe("sort_items", () => {
  const items = [item("b", "kruh", 2), item("a", "Mleko", 1), item("c", "jajca", 3)];

  test("oldest and newest first by the date added", () => {
    expect(ids(sort_items(items, ItemSort.OLDEST))).toEqual(["a", "b", "c"]);
    expect(ids(sort_items(items, ItemSort.NEWEST))).toEqual(["c", "b", "a"]);
  });

  test("oldest first keeps the list's order for items added at the same time", () => {
    expect(ids(sort_items([item("y", "a", 5), item("x", "b", 5)], ItemSort.OLDEST))).toEqual(["y", "x"]);
  });

  test("by name, ignoring case", () => {
    expect(ids(sort_items(items, ItemSort.NAME))).toEqual(["c", "b", "a"]);
    expect(ids(sort_items(items, ItemSort.NAME_DESC))).toEqual(["a", "b", "c"]);
  });

  test("names that differ only in case or accents fall back to the date added", () => {
    const same = [item("late", "Sir", 9), item("early", "sír", 1)];
    expect(ids(sort_items(same, ItemSort.NAME))).toEqual(["early", "late"]);
    expect(ids(sort_items(same, ItemSort.NAME_DESC))).toEqual(["early", "late"]);
  });

  test("leaves the input alone", () => {
    sort_items(items, ItemSort.NAME);
    expect(ids(items)).toEqual(["b", "a", "c"]);
  });
});
