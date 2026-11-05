import { app_data_path } from "$lib/core/contexts/app";
import { z } from "zod";
import { GoalsSchema } from "./goals";
import { APP_ID } from "./sections";

export const STORAGE_PATH = app_data_path(APP_ID, "storage.json");

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  key: z.string().catch(""),
  goals: GoalsSchema.catch([]),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { key: "", goals: [] };
}
