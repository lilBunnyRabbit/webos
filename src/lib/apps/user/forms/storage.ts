import { PATHS } from "$lib/core/api/services/files/hierarchy";
import { z } from "zod";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  folder: z.string().catch(PATHS.documents),
  respondent: z.string().catch(""),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { folder: PATHS.documents, respondent: "" };
}
