import { z } from "zod";
import { PRESSURE_MODES, PressureMode } from "./pressure";

const SAMPLE = "The quick brown fox jumps over the lazy dog";

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  sample: z.string().max(500).catch(SAMPLE),
  "show-guide": z.boolean().catch(true),
  pressure: z.enum(PRESSURE_MODES).catch(PressureMode.SPEED),
  "edit-spacing": z.boolean().catch(false),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { sample: SAMPLE, "show-guide": true, pressure: PressureMode.SPEED, "edit-spacing": false };
}
