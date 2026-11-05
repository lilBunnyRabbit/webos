import { z } from "zod";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  collapse: z.boolean().catch(true),
  "ignore-whitespace": z.boolean().catch(false),
  wrap: z.boolean().catch(false),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { collapse: true, "ignore-whitespace": false, wrap: false };
}
