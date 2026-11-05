import { z } from "zod";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  wins: z.number().int().nonnegative().catch(0),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { wins: 0 };
}
