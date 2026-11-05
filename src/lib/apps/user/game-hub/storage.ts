import { z } from "zod";
import { Sort } from "./hub";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  sort: z.enum(Sort).catch(Sort.RECENT),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { sort: Sort.RECENT };
}
