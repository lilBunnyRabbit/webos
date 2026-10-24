import { describe, expect, test } from "vitest";
import { added_from, ItemSchema, new_id } from "./data";

describe("added_at", () => {
  test("an item saved before it existed gets the time from its id", () => {
    const id = new_id(1_761_300_000_000);
    expect(ItemSchema.parse({ id, text: "mleko", checked: false, updated_at: 1_761_400_000_000 }).added_at).toBe(1_761_300_000_000);
  });

  test("an id without a time falls back to the last change", () => {
    expect(added_from({ id: "a", updated_at: 7 })).toBe(7);
    expect(added_from({ id: "not a-time", updated_at: 7 })).toBe(7);
  });

  test("a saved date is kept", () => {
    expect(ItemSchema.parse({ id: new_id(1), text: "mleko", checked: false, added_at: 5, updated_at: 9 }).added_at).toBe(5);
  });
});
