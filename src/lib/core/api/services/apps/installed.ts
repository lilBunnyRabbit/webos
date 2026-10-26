import { z } from "zod";
import { PATHS } from "../files/hierarchy";
import type { AppId } from "./type";

/** Package databases live in `/var/lib` (ADR-040); app data folders sit beside it, and no app id ends in `.json`. */
export const INSTALLED_PATH = `${PATHS.var_lib}/apps/installed.json`;
/** The installed apps' catalogue entries (ADR-077): StoreService writes it, boot reads only this. */
export const CATALOGUE_PATH = `${PATHS.var_lib}/apps/catalogue.json`;
const INSTALLED_VERSION = 1;

const installed_schema = z.object({
  version: z.literal(INSTALLED_VERSION),
  installed: z.array(z.string()),
  /** The list holds system apps too (ADR-077). A list without it is from before, when every system app was installed. */
  system: z.literal(true).optional(),
});

export interface InstalledList {
  ids: AppId[];
  /** `false`: written before system apps could be uninstalled, so it names user apps only. */
  system: boolean;
}

/** The installed ids, or `null` when the file is missing or invalid. */
export function parse_installed(text: string | null): InstalledList | null {
  if (text === null) return null;
  try {
    const result = installed_schema.safeParse(JSON.parse(text));
    return result.success ? { ids: result.data.installed, system: result.data.system === true } : null;
  } catch {
    return null;
  }
}

export function serialize_installed(ids: Iterable<AppId>): string {
  return JSON.stringify({ version: INSTALLED_VERSION, installed: [...new Set(ids)].sort(), system: true }, null, 2) + "\n";
}
