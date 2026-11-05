import { z } from "zod";
import { ScoreSchema } from "./game";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  best: ScoreSchema.nullable().catch(null),
  recognised: z.number().int().nonnegative().catch(0),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { best: null, recognised: 0 };
}
