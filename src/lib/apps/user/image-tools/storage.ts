import { z } from "zod";
import { FIT_FORMATS, FitFormat } from "./fit";
import { MAX_ACROSS, MAX_OVERLAP, POSTER_PAPERS } from "./poster";
import { DEFAULT_SETTINGS as DEFAULT_SPRITE_SETTINGS, SETTINGS_SCHEMA as sprite_settings_schema } from "./sprite-model";
import { DEFAULT_SQUASH, SquashFormat } from "./squash";
import { DEFAULT_OUTPUT, DEFAULT_SPEC, SizeBy, test_image_schema, test_output_schema } from "./test-image";

const fit_schema = z.object({ limit: z.string(), custom: z.string(), format: z.enum(FIT_FORMATS), max: z.number().int().min(1).nullable() });
const poster_schema = z.object({
  paper: z.enum(POSTER_PAPERS),
  orientation: z.enum(["portrait", "landscape"]),
  across: z.number().int().min(1).max(MAX_ACROSS),
  overlap: z.number().min(0).max(MAX_OVERLAP),
  margin: z.enum(["5", "10", "15"]),
  marks: z.boolean(),
  map: z.boolean(),
});
const squash_schema = z.object({
  format: z.enum([SquashFormat.WEBP, SquashFormat.JPEG]),
  quality: z.number().min(1).max(100),
  max: z.number().int().min(1).nullable(),
});
const test_settings_schema = z.object({
  spec: test_image_schema,
  format: test_output_schema.shape.format,
  quality: test_output_schema.shape.quality,
  by: z.enum([SizeBy.DIMENSIONS, SizeBy.BYTES]),
  target: z.string(),
});

export interface StorageFile {
  fit: z.infer<typeof fit_schema>;
  poster: z.infer<typeof poster_schema>;
  squash: z.infer<typeof squash_schema>;
  "test-image": z.infer<typeof test_settings_schema>;
  "sprite-settings": z.infer<typeof sprite_settings_schema>;
}

export function empty_storage(): StorageFile {
  return {
    fit: { limit: String(1_000_000), custom: "1.5 MB", format: FitFormat.KEEP, max: null },
    poster: { paper: "a4", orientation: "portrait", across: 3, overlap: 10, margin: "10", marks: true, map: true },
    squash: { ...DEFAULT_SQUASH },
    "test-image": { spec: DEFAULT_SPEC, format: DEFAULT_OUTPUT.format, quality: DEFAULT_OUTPUT.quality, by: SizeBy.DIMENSIONS, target: "500MB" },
    "sprite-settings": DEFAULT_SPRITE_SETTINGS,
  };
}

// One schema for every section: whichever section opens storage.json first parses it for all of them.
// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  fit: fit_schema.catch(() => empty_storage().fit),
  poster: poster_schema.catch(() => empty_storage().poster),
  squash: squash_schema.catch(() => empty_storage().squash),
  "test-image": test_settings_schema.catch(() => empty_storage()["test-image"]),
  "sprite-settings": sprite_settings_schema.catch(() => empty_storage()["sprite-settings"]),
});
