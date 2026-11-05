import { z } from "zod";
import { UnitSystem } from "./constants";
import { DEFAULT_FOLDER } from "./library";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  folder: z.string().startsWith("/").catch(DEFAULT_FOLDER),
  units: z.enum(UnitSystem).catch(UnitSystem.WRITTEN),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { folder: DEFAULT_FOLDER, units: UnitSystem.WRITTEN };
}
