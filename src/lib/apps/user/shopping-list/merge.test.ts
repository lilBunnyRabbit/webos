import { describe, expect, test } from "vitest";
import { stamp, TOMBSTONE_MS, type Item } from "./data";
import { item_key, live, merge_items, newer, prune } from "./merge";

const item = (id: string, text: string, updated_at: number, extra: Partial<Item> = {}): Item => ({
  id,
  text,
  checked: false,
  added_at: updated_at,
  updated_at,
  ...extra,
});

describe("newer", () => {
  test("the later stamp wins", () => {
    const old = item("a", "mleko", 1);
    const fresh = item("a", "mleko", 2, { checked: true });
    expect(newer(old, fresh)).toBe(fresh);
    expect(newer(fresh, old)).toBe(fresh);
  });

  test("equal stamps pick the same version whichever side asks", () => {
    const one = item("a", "mleko", 5, { checked: true });
    const two = item("a", "kruh", 5);
    expect(newer(one, two)).toBe(newer(two, one));
  });
});

describe("merge_items", () => {
  test("keeps items from both sides, sorted by id, and is the same in either order", () => {
    const left = [item("b", "kruh", 1), item("d", "sir", 1)];
    const right = [item("a", "mleko", 1), item("c", "jajca", 1)];
    expect(merge_items(left, right).map((entry) => entry.id)).toEqual(["a", "b", "c", "d"]);
    expect(merge_items(left, right)).toEqual(merge_items(right, left));
  });

  test("a deletion is just a newer version: it wins over an older edit, and loses to a newer one", () => {
    const deleted = item("a", "mleko", 10, { deleted_at: 10 });
    expect(merge_items([item("a", "mleko", 5, { checked: true })], [deleted])).toEqual([deleted]);
    const edited = item("a", "2 l mleko", 12);
    expect(merge_items([deleted], [edited])).toEqual([edited]);
  });
});

describe("prune", () => {
  test("drops deletions older than the window and keeps the rest", () => {
    const now = 100 * TOMBSTONE_MS;
    const items = [
      item("a", "old", 1, { deleted_at: now - TOMBSTONE_MS - 1 }),
      item("b", "recent", 1, { deleted_at: now - TOMBSTONE_MS }),
      item("c", "alive", 1),
    ];
    expect(prune(items, now).map((entry) => entry.id)).toEqual(["b", "c"]);
  });
});
