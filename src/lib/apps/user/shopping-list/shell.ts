import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import { live_file } from "$lib/core/contexts/app";
import { APP_ID, empty_file, LISTS_PATH, ListsFileSchema, type Item, type List } from "./data";
import { left_count } from "./items";
import { live } from "./merge";
import { format_amount } from "./parse";

const file = live_file(LISTS_PATH, empty_file(), ListsFileSchema);

export function open_list(list: string): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { list });
}

export async function lists(): Promise<Tagged[]> {
  return (await file.read()).lists.map((list) => {
    const left = left_count(list);
    return { $type: "shopping-list", id: list.id, name: list.name, left, in_cart: live(list.items).length - left };
  });
}

function item_value(list: List, item: Item): Tagged {
  return { $type: "shopping-item", list: list.name, list_id: list.id, amount: format_amount(item), item: item.text, in_cart: item.checked };
}

export async function items({ args }: CommandContext<{ list?: string }>): Promise<Tagged[]> {
  const all = (await file.read()).lists;
  const wanted = args.list?.trim().toLocaleLowerCase();
  const picked = wanted ? all.filter((list) => list.name.toLocaleLowerCase() === wanted || list.id === wanted) : all;
  if (picked.length === 0) throw new ShellError(`No list called "${args.list}". Lists: ${all.map((list) => list.name).join(", ")}`);
  return picked.flatMap((list) => {
    const current = live(list.items);
    return [...current.filter((item) => !item.checked), ...current.filter((item) => item.checked)].map((item) => item_value(list, item));
  });
}
