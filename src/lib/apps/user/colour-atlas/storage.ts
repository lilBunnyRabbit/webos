import { z } from "zod";
import { dex_schema, run_state_schema } from "./game";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  dex: dex_schema.catch({}),
  daily: z.object({ day: z.string(), state: run_state_schema }).nullable().catch(null),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { dex: {}, daily: null };
}
