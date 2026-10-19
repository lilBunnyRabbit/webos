import { afterEach, expect, test, vi } from "vitest";
import { create_offer, create_peer } from "$kit/utils/p2p";
import { ListColor, type Item, type List, type ListMeta } from "./data";
import { merge_items } from "./merge";
import { parse_message } from "./sync";
import { PairSession, PairState } from "./sync.svelte";

const sessions: PairSession[] = [];
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()));

/** A device: its lists and a session that merges into them, as the app's host does. */
function device(lists: List[]) {
  const host = {
    lists,
    list: (id: string) => host.lists.find((list) => list.id === id),
    merge(list_id: string, items: Item[], meta: ListMeta | null) {
      let target = host.list(list_id);
      if (!target) {
        if (!meta) return;
        target = { ...meta, items: [] };
        host.lists.push(target);
      }
      target.items = merge_items(target.items, items);
    },
  };
  const session = new PairSession(host);
  sessions.push(session);
  return { host, session };
}

const item = (id: string, text: string, updated_at: number, extra: Partial<Item> = {}): Item => ({
  id,
  text,
  checked: false,
  updated_at,
  ...extra,
});

async function pair(a: ReturnType<typeof device>, b: ReturnType<typeof device>, list_id: string) {
  await a.session.start(list_id);
  await vi.waitFor(() => expect(a.session.code).toBeTruthy(), { timeout: 10_000 });
  await b.session.join(a.session.code!);
  await a.session.answer(b.session.code!);
  await vi.waitFor(
    () => {
      expect(a.session.state).toBe(PairState.LIVE);
      expect(b.session.state).toBe(PairState.LIVE);
    },
    { timeout: 15_000 }
  );
}

test("pairing shares one list, both sides edit it live, and pairing again merges what changed apart", async () => {
  const a = device([
    { id: "shop", name: "Groceries", color: ListColor.SUCCESS, items: [item("1", "mleko", 1), item("2", "kruh", 1)] },
    { id: "other", name: "Hardware", color: ListColor.INFO, items: [item("9", "vijaki", 1)] },
  ]);
  const b = device([]);
  await pair(a, b, "shop");

  await vi.waitFor(() => expect(b.host.list("shop")?.items).toEqual(a.host.list("shop")!.items));
  expect(b.host.list("shop")).toMatchObject({ name: "Groceries", color: ListColor.SUCCESS });
  expect(b.host.list("other")).toBeUndefined();
  expect(b.session.list_id).toBe("shop");

  const shared_b = b.host.list("shop")!;
  shared_b.items = [...shared_b.items.map((entry) => (entry.id === "1" ? { ...entry, checked: true, updated_at: 5 } : entry)), item("3", "jajca", 6)];
  b.session.push(shared_b.items);
  await vi.waitFor(() => expect(a.host.list("shop")!.items).toEqual(shared_b.items));

  a.session.dispose();
  await vi.waitFor(() => expect(b.session.state).toBe(PairState.OFFLINE), { timeout: 15_000 });

  const shared_a = a.host.list("shop")!;
  shared_a.items = shared_a.items.map((entry) => (entry.id === "2" ? { ...entry, deleted_at: 10, updated_at: 10 } : entry));
  shared_b.items = shared_b.items.map((entry) => (entry.id === "3" ? { ...entry, text: "6 jajc", updated_at: 11 } : entry));

  const again = device(a.host.lists);
  await pair(again, b, "shop");
  await vi.waitFor(() => {
    b.session.push(b.host.list("shop")!.items);
    expect(b.host.list("shop")!.items).toEqual(again.host.list("shop")!.items);
    expect(again.host.list("shop")!.items.map((entry) => [entry.text, entry.checked, entry.deleted_at ?? null])).toEqual([
      ["mleko", true, null],
      ["kruh", false, 10],
      ["6 jajc", false, null],
    ]);
  });
});

test("a code from another app connects but isn't taken for a shopping list", async () => {
  const b = device([]);
  const sender = create_peer();
  const { code } = await create_offer(sender, "files");
  await b.session.join(code);
  const { accept_answer } = await import("$kit/utils/p2p");
  await accept_answer(sender, b.session.code!);
  await vi.waitFor(() => expect(b.session.error).toMatch(/another app/), { timeout: 15_000 });
  expect(b.session.state).toBe(PairState.IDLE);
  sender.close();
});

test("parse_message takes only this version's messages", () => {
  expect(parse_message(JSON.stringify({ type: "items", items: [item("1", "mleko", 1)] }))).not.toBeNull();
  expect(parse_message(JSON.stringify({ type: "hello", version: 2, list: { id: "a", name: "A", color: "primary" }, items: [] }))).toBeNull();
  expect(parse_message("not json")).toBeNull();
  expect(parse_message(new ArrayBuffer(2))).toBeNull();
});
