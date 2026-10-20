import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import type { AppId } from "./type";

export const RECENT_PATH = `${PATHS.var_lib}/apps/recent.json`;
export const RECENT_LIMIT = 16;
const RECENT_VERSION = 1;

const recent_schema = z.object({
  version: z.literal(RECENT_VERSION),
  ids: z.array(z.unknown()),
});

export function parse_recent(text: string | null): AppId[] {
  if (text === null) return [];
  try {
    const result = recent_schema.safeParse(JSON.parse(text));
    if (!result.success) return [];
    const ids = result.data.ids.filter((id): id is AppId => typeof id === "string" && id.length > 0);
    return [...new Set(ids)].slice(0, RECENT_LIMIT);
  } catch {
    return [];
  }
}

export function serialize_recent(ids: readonly AppId[]): string {
  return JSON.stringify({ version: RECENT_VERSION, ids }, null, 2) + "\n";
}

export function with_recent(ids: readonly AppId[], id: AppId): AppId[] {
  return [id, ...ids.filter((other) => other !== id)].slice(0, RECENT_LIMIT);
}
