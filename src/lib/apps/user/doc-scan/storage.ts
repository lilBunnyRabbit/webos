import { z } from "zod";
import { PageFilter } from "./warp";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  filter: z.enum(PageFilter).catch(PageFilter.COLOR),
  pages: z.number().int().nonnegative().catch(0),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { filter: PageFilter.COLOR, pages: 0 };
}
