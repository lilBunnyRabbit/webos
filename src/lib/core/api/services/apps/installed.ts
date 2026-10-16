import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import type { AppId } from "./type";

/** Package databases live in `/var/lib` (ADR-040); app data folders sit beside it, and no app id ends in `.json`. */
export const INSTALLED_PATH = `${PATHS.var_lib}/apps/installed.json`;
const INSTALLED_VERSION = 1;

const installed_schema = z.object({
  version: z.literal(INSTALLED_VERSION),
  installed: z.array(z.string()),
});

/** The installed ids, or `null` when the file is missing or invalid. */
export function parse_installed(text: string | null): AppId[] | null {
  if (text === null) return null;
  try {
    const result = installed_schema.safeParse(JSON.parse(text));
    return result.success ? result.data.installed : null;
  } catch {
    return null;
  }
}

export function serialize_installed(ids: Iterable<AppId>): string {
  return JSON.stringify({ version: INSTALLED_VERSION, installed: [...new Set(ids)].sort() }, null, 2) + "\n";
}
