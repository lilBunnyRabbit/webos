import { history_key, new_id, stamp, type List } from "./data";
import { live } from "./merge";
import { parse_entry } from "./parse";

export function add_entry(list: List, text: string, now = Date.now()): boolean {
  const entry = parse_entry(text);
  if (!entry.text) return false;
  const key = history_key(entry.text);
  const existing = list.items.find((item) => item.deleted_at === undefined && history_key(item.text) === key);
  if (existing) {
    existing.checked = false;
    if (entry.qty !== undefined) {
      existing.qty = entry.qty;
      existing.unit = entry.unit;
    }
    existing.updated_at = stamp(existing, now);
    return true;
  }
  list.items.push({ id: new_id(now), text: entry.text, qty: entry.qty, unit: entry.unit, checked: false, updated_at: stamp(undefined, now) });
  return true;
}

export const left_count = (list: List) => live(list.items).filter((item) => !item.checked).length;
