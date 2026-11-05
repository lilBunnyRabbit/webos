import { app_data_path } from "$lib/core/contexts/app";
import { z } from "zod";
import { APP_ID } from "./journal";

export const STORAGE_PATH = app_data_path(APP_ID, "storage.json");

function hidden_default(mobile: boolean): number {
  return mobile ? 0 : 60;
}

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
// The app and the widget open the same file, so both build the schema for the platform they run on.
export function storage_schema(mobile: boolean) {
  return z.object({
    journal: z.string().nullable().catch(null),
    "idle-minutes": z.number().int().min(0).max(120).catch(5),
    "quick-offer-declined": z.array(z.string()).catch([]),
    "hidden-seconds": z.number().int().min(0).max(3600).catch(hidden_default(mobile)),
  });
}
export type StorageFile = z.infer<ReturnType<typeof storage_schema>>;

export function empty_storage(mobile: boolean): StorageFile {
  return { journal: null, "idle-minutes": 5, "quick-offer-declined": [], "hidden-seconds": hidden_default(mobile) };
}
