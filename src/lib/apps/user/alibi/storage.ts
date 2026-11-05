import { z } from "zod";
import { saved_schema } from "./case";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  closed: z.number().int().nonnegative().catch(0),
  case: saved_schema.nullable().catch(null),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { closed: 0, case: null };
}
