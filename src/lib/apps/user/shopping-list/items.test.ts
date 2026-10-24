import { describe, expect, test } from "vitest";
import { ListColor, type List } from "./data";
import { add_entry, left_count } from "./items";

const list = (items: List["items"] = []): List => ({ id: "groceries", name: "Groceries", color: ListColor.PRIMARY, items });

describe("add_entry", () => {
  test("adds a parsed item", () => {
    const target = list();
    expect(add_entry(target, "2x mleko", 1000)).toBe(true);
    expect(target.items).toHaveLength(1);
    expect(target.items[0]).toMatchObject({ text: "mleko", qty: 2, checked: false, added_at: 1000, updated_at: 1000 });
  });

  test("an open item with the same name is unticked and takes the new amount", () => {
    const target = list([{ id: "a", text: "Mleko", qty: 1, checked: true, added_at: 5000, updated_at: 5000 }]);
    add_entry(target, "3 mleko", 1000);
    expect(target.items).toHaveLength(1);
    expect(target.items[0]).toMatchObject({ checked: false, qty: 3, added_at: 5000, updated_at: 5001 });
  });

  test("a deleted item doesn't count as open", () => {
    const target = list([{ id: "a", text: "mleko", checked: false, added_at: 1, updated_at: 1, deleted_at: 1 }]);
    add_entry(target, "mleko", 1000);
    expect(target.items).toHaveLength(2);
  });

  test("nothing to add", () => {
    const target = list();
    expect(add_entry(target, "   ", 1000)).toBe(false);
    expect(target.items).toHaveLength(0);
  });
});

test("left_count skips ticked and deleted items", () => {
  const target = list([
    { id: "a", text: "a", checked: false, added_at: 1, updated_at: 1 },
    { id: "b", text: "b", checked: true, added_at: 1, updated_at: 1 },
    { id: "c", text: "c", checked: false, added_at: 1, updated_at: 1, deleted_at: 1 },
  ]);
  expect(left_count(target)).toBe(1);
});
