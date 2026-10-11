import { z } from "zod";
import { PATHS } from "../files/hierarchy";

export const VERSION_STATE_PATH = `${PATHS.var_lib}/version/state.json`;
const STATE_VERSION = 1;

const state_schema = z.object({
  version: z.literal(STATE_VERSION),
  seen: z.string().min(1),
});

/** The last release this device was told about, or `null` for a first boot (or a corrupt file). */
export function parse_seen(text: string): string | null {
  try {
    const result = state_schema.safeParse(JSON.parse(text));
    return result.success ? result.data.seen : null;
  } catch {
    return null;
  }
}

export function serialize_seen(seen: string): string {
  return JSON.stringify({ version: STATE_VERSION, seen }, null, 2);
}
