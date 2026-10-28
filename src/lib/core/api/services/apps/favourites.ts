import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import { with_pin } from "../settings/taskbar";
import type { AppId } from "./type";

export const FAVOURITES_PATH = `${PATHS.var_lib}/apps/favourites.json`;
/** Every tab reads and writes the file under it, so one tab's change never overwrites another's. */
export const FAVOURITES_LOCK = "webos.apps.favourites";
const FAVOURITES_VERSION = 1;

const favourites_schema = z.object({
  version: z.literal(FAVOURITES_VERSION),
  ids: z.array(z.unknown()),
});

export function parse_favourites(text: string | null): AppId[] {
  if (text === null) return [];
  try {
    const result = favourites_schema.safeParse(JSON.parse(text));
    if (!result.success) return [];
    const ids = result.data.ids.filter((id): id is AppId => typeof id === "string" && id.length > 0);
    return [...new Set(ids)];
  } catch {
    return [];
  }
}

export function serialize_favourites(ids: readonly AppId[]): string {
  return JSON.stringify({ version: FAVOURITES_VERSION, ids }, null, 2) + "\n";
}

export function with_favourite(ids: readonly AppId[], id: AppId): AppId[] {
  return ids.includes(id) ? [...ids] : [...ids, id];
}

export function without_favourite(ids: readonly AppId[], id: AppId): AppId[] {
  return ids.filter((other) => other !== id);
}

/** `index` counts the shown list; saved ids that aren't shown (not installed yet) keep their neighbours. */
export function moved_favourite(ids: readonly AppId[], shown: readonly AppId[], id: AppId, index: number): AppId[] {
  if (!ids.includes(id)) return [...ids];
  const rest = shown.filter((other) => other !== id);
  const saved = ids.filter((other) => other !== id);
  const before = rest[Math.max(0, index)];
  const last = rest.at(-1);
  const at = before !== undefined ? saved.indexOf(before) : last !== undefined ? saved.indexOf(last) + 1 : saved.length;
  return with_pin(ids, id, at);
}
