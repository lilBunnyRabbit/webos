import { z } from "zod";
import { ListSchema, type Item, type List, type ListMeta } from "./data";
import { format_amount } from "./parse";
import { item_key, newer } from "./merge";

/** The tag in every QR frame of a list share (ADR-053). */
export const SHARE_APP = "SL";

const ShareSchema = z.object({ v: z.literal(1), lists: z.array(ListSchema).min(1) });
export type Share = z.infer<typeof ShareSchema>;

export function share_of(lists: readonly List[]): Share {
  // A JSON round trip, not structuredClone: the app passes its reactive proxies.
  return { v: 1, lists: lists.map((list) => JSON.parse(JSON.stringify(list)) as List) };
}

export function read_share(payload: unknown): Share {
  const parsed = ShareSchema.safeParse(payload);
  if (!parsed.success) throw new Error("These codes aren't a Shopping List share from this version");
  return parsed.data;
}

export const ChangeKind = {
  NEW_LIST: "new-list",
  DETAILS: "details",
  ADD: "add",
  EDIT: "edit",
  TICK: "tick",
  UNTICK: "untick",
  DELETE: "delete",
} as const;
export type ChangeKind = (typeof ChangeKind)[keyof typeof ChangeKind];

interface BaseChange {
  /** Stable within one review, for the checkbox. */
  id: string;
  list_id: string;
}

export type Change =
  | (BaseChange & { kind: typeof ChangeKind.NEW_LIST; list: List; count: number })
  | (BaseChange & { kind: typeof ChangeKind.DETAILS; from: Pick<ListMeta, "name" | "color" | "icon">; to: Pick<ListMeta, "name" | "color" | "icon"> })
  | (BaseChange & { kind: typeof ChangeKind.ADD | typeof ChangeKind.TICK | typeof ChangeKind.UNTICK | typeof ChangeKind.DELETE; item: Item })
  | (BaseChange & { kind: typeof ChangeKind.EDIT; item: Item; before: Item });

export interface ListReview {
  list_id: string;
  /** The incoming name: what the sender calls it. */
  name: string;
  changes: Change[];
}

const amount_text = (item: Item) => [format_amount(item), item.text].filter(Boolean).join(" ");

export const describe_item = amount_text;

/**
 * What applying `share` would change here, per list. Items resolve with the same newest-wins rule a merge uses
 * (`newer`), so only incoming versions that would win show up. Name, colour and icon carry no timestamp: a difference
 * is offered and the user decides.
 */
export function review_share(local: readonly List[], share: Share): ListReview[] {
  return share.lists.map((incoming) => {
    const mine = local.find((list) => list.id === incoming.id);
    if (!mine) {
      const count = incoming.items.filter((item) => item.deleted_at === undefined).length;
      return { list_id: incoming.id, name: incoming.name, changes: [{ id: `${incoming.id}:list`, list_id: incoming.id, kind: ChangeKind.NEW_LIST, list: incoming, count }] };
    }
    const changes: Change[] = [];
    const from = { name: mine.name, color: mine.color, icon: mine.icon };
    const to = { name: incoming.name, color: incoming.color, icon: incoming.icon };
    if (from.name !== to.name || from.color !== to.color || (to.icon !== undefined && from.icon !== to.icon)) {
      changes.push({ id: `${incoming.id}:details`, list_id: incoming.id, kind: ChangeKind.DETAILS, from, to });
    }
    const by_id = new Map(mine.items.map((item) => [item.id, item]));
    for (const item of incoming.items) {
      const before = by_id.get(item.id);
      const base = { id: `${incoming.id}:${item.id}`, list_id: incoming.id };
      if (!before) {
        if (item.deleted_at === undefined) changes.push({ ...base, kind: ChangeKind.ADD, item });
        continue;
      }
      if (item_key(item) === item_key(before) || newer(before, item) !== item) continue;
      const gone = item.deleted_at !== undefined;
      const was_gone = before.deleted_at !== undefined;
      if (gone && was_gone) continue;
      if (gone) changes.push({ ...base, kind: ChangeKind.DELETE, item: before });
      else if (was_gone) changes.push({ ...base, kind: ChangeKind.ADD, item });
      else if (item.text !== before.text || item.qty !== before.qty || item.unit !== before.unit) changes.push({ ...base, kind: ChangeKind.EDIT, item, before });
      else if (item.checked !== before.checked) changes.push({ ...base, kind: item.checked ? ChangeKind.TICK : ChangeKind.UNTICK, item });
    }
    return { list_id: incoming.id, name: incoming.name, changes };
  });
}

/** Writes the picked changes into `lists` (the app's live state). An item takes the incoming version whole. */
export function apply_changes(lists: List[], share: Share, picked: ReadonlySet<string>, reviews: readonly ListReview[]): number {
  let applied = 0;
  for (const review of reviews) {
    const incoming = share.lists.find((list) => list.id === review.list_id);
    if (!incoming) continue;
    for (const change of review.changes) {
      if (!picked.has(change.id)) continue;
      applied++;
      if (change.kind === ChangeKind.NEW_LIST) {
        lists.push(structuredClone(change.list));
        continue;
      }
      const target = lists.find((list) => list.id === change.list_id);
      if (!target) continue;
      if (change.kind === ChangeKind.DETAILS) {
        target.name = change.to.name;
        target.color = change.to.color;
        if (change.to.icon) target.icon = change.to.icon;
        continue;
      }
      const version = incoming.items.find((item) => item.id === change.item.id);
      if (!version) continue;
      const index = target.items.findIndex((item) => item.id === version.id);
      if (index === -1) target.items.push(structuredClone(version));
      else target.items[index] = structuredClone(version);
    }
  }
  return applied;
}
