import { z } from "zod";
import { DEFAULT_OPTIONS, MAX_PRECISION, MIN_PRECISION } from "./optimize";
import { Backdrop } from "./svg-stage.svelte";

export const MAX_PNG = 8192;
const DEFAULT_PNG_SIZES = [64, 128, 256, 512];

const options_schema = z.object({
  precision: z.number().int().min(MIN_PRECISION).max(MAX_PRECISION).catch(DEFAULT_OPTIONS.precision),
  multipass: z.boolean().catch(DEFAULT_OPTIONS.multipass),
  keep_ids: z.boolean().catch(DEFAULT_OPTIONS.keep_ids),
  merge_paths: z.boolean().catch(DEFAULT_OPTIONS.merge_paths),
  strip_size: z.boolean().catch(DEFAULT_OPTIONS.strip_size),
  strip_title: z.boolean().catch(DEFAULT_OPTIONS.strip_title),
  pretty: z.boolean().catch(DEFAULT_OPTIONS.pretty),
});

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  options: options_schema.catch(() => ({ ...DEFAULT_OPTIONS })),
  "png-sizes": z.array(z.number().int().min(1).max(MAX_PNG)).catch(() => [...DEFAULT_PNG_SIZES]),
  backdrop: z.enum([Backdrop.CHECKER, Backdrop.LIGHT, Backdrop.DARK]).catch(Backdrop.CHECKER),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { options: { ...DEFAULT_OPTIONS }, "png-sizes": [...DEFAULT_PNG_SIZES], backdrop: Backdrop.CHECKER };
}
