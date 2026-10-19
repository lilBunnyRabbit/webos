import { describe, expect, test } from "vitest";
import { stamp, TOMBSTONE_MS, type Item } from "./data";
import { item_key, live, merge_items, newer, prune, unsent } from "./merge";

const item = (id: string, text: string, updated_at: number, extra: Partial<Item> = {}): Item => ({
  id,
  text,
  checked: false,
  updated_at,
  ...extra,
});

/** One device's copy of the shared list and what it knows the other has: the same steps PairSession takes. */
class Replica {
  known = new Map<string, string>();
  online = true;

  constructor(public items: Item[] = []) {}

  edit(id: string, change: Partial<Item>, now: number) {
    this.items = this.items.map((entry) => (entry.id === id ? { ...entry, ...change, updated_at: stamp(entry, now) } : entry));
  }

  add(entry: Item) {
    this.items = [...this.items, entry];
  }

  outbox(): Item[] {
    const changed = unsent(this.items, this.known);
    for (const entry of changed) this.known.set(entry.id, item_key(entry));
    return changed;
  }

  receive(incoming: Item[]) {
    for (const entry of incoming) this.known.set(entry.id, item_key(entry));
    this.items = merge_items(this.items, incoming);
  }
}

/** Exchanges until neither side has anything to send, like the live channel does change by change. */
function sync(a: Replica, b: Replica) {
  for (let round = 0; round < 10; round++) {
    const from_a = a.outbox();
    const from_b = b.outbox();
    if (from_a.length === 0 && from_b.length === 0) return round;
    if (from_a.length) b.receive(from_a);
    if (from_b.length) a.receive(from_b);
  }
  throw new Error("never settled");
}

/** A new connection: neither side assumes anything about the other, so the hello exchange sends everything. */
function reconnect(a: Replica, b: Replica) {
  a.known.clear();
  b.known.clear();
  return sync(a, b);
}

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

describe("two devices", () => {
  test("an item added on one shows up on the other", () => {
    const a = new Replica([item("1", "mleko", 1)]);
    const b = new Replica();
    reconnect(a, b);
    a.add(item("2", "kruh", 2));
    sync(a, b);
    expect(b.items).toEqual(a.items);
    expect(live(b.items).map((entry) => entry.text)).toEqual(["mleko", "kruh"]);
  });

  test("concurrent edits to the same item settle on the newer one on both sides", () => {
    const a = new Replica([item("1", "mleko", 1)]);
    const b = new Replica();
    reconnect(a, b);
    a.edit("1", { checked: true }, 10);
    b.edit("1", { text: "2 l mleko" }, 11);
    sync(a, b);
    expect(a.items).toEqual(b.items);
    expect(a.items[0]).toMatchObject({ text: "2 l mleko", checked: false, updated_at: 11 });
  });

  test("concurrent edits with the same stamp still agree", () => {
    const a = new Replica([item("1", "mleko", 1)]);
    const b = new Replica();
    reconnect(a, b);
    a.edit("1", { checked: true }, 10);
    b.edit("1", { text: "kruh" }, 10);
    sync(a, b);
    expect(a.items).toEqual(b.items);
  });

  test("delete on one side and edit on the other: the later change wins", () => {
    const a = new Replica([item("1", "mleko", 1), item("2", "kruh", 1)]);
    const b = new Replica();
    reconnect(a, b);
    a.edit("1", { deleted_at: 20 }, 20);
    b.edit("1", { checked: true }, 15);
    a.edit("2", { deleted_at: 20 }, 20);
    b.edit("2", { checked: true }, 25);
    sync(a, b);
    expect(a.items).toEqual(b.items);
    expect(live(a.items).map((entry) => [entry.text, entry.checked])).toEqual([["kruh", true]]);
  });

  test("a received change isn't sent straight back", () => {
    const a = new Replica([item("1", "mleko", 1)]);
    const b = new Replica();
    reconnect(a, b);
    a.edit("1", { checked: true }, 5);
    expect(a.outbox()).toHaveLength(1);
    b.receive(a.items);
    expect(b.outbox()).toEqual([]);
  });

  test("changes made apart merge on reconnect, deletions included", () => {
    const a = new Replica([item("1", "mleko", 1), item("2", "kruh", 1), item("3", "sir", 1)]);
    const b = new Replica();
    reconnect(a, b);

    a.online = b.online = false;
    a.edit("1", { checked: true }, 10);
    a.edit("2", { deleted_at: 11 }, 11);
    a.add(item("4", "jajca", 12));
    b.edit("3", { text: "parmezan" }, 13);
    b.edit("1", { text: "ovseno mleko" }, 14);
    b.add(item("5", "banane", 15));

    reconnect(a, b);
    expect(a.items).toEqual(b.items);
    expect(live(a.items).map((entry) => entry.text)).toEqual(["ovseno mleko", "parmezan", "jajca", "banane"]);
    expect(a.items.find((entry) => entry.id === "2")?.deleted_at).toBe(11);
  });

  test("a device whose clock is behind still moves an item forward", () => {
    const a = new Replica([item("1", "mleko", 1000)]);
    const b = new Replica();
    reconnect(a, b);
    b.edit("1", { checked: true }, 10);
    sync(a, b);
    expect(a.items[0].checked).toBe(true);
    expect(a.items[0].updated_at).toBe(1001);
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
