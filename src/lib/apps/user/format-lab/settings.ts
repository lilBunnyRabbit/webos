import { z } from "zod";
import { CodecFormat, default_options } from "$kit/utils/codecs/formats";

export const LAB_FORMATS = [CodecFormat.JPEG, CodecFormat.WEBP, CodecFormat.AVIF, CodecFormat.JXL] as const;
export type LabFormat = (typeof LAB_FORMATS)[number];

export interface FormatSettings {
  quality: number;
  effort: number;
  lossless: boolean;
}

export type LabSettings = Record<LabFormat, FormatSettings>;

const FormatSettingsSchema = z.object({
  quality: z.number().int().min(1).max(100),
  effort: z.number().int().min(0).max(10),
  lossless: z.boolean(),
});

export const LabSettingsSchema = z.object({
  jpeg: FormatSettingsSchema,
  webp: FormatSettingsSchema,
  avif: FormatSettingsSchema,
  jxl: FormatSettingsSchema,
});

export function default_settings(): LabSettings {
  return {
    jpeg: default_options(CodecFormat.JPEG),
    webp: default_options(CodecFormat.WEBP),
    avif: default_options(CodecFormat.AVIF),
    jxl: default_options(CodecFormat.JXL),
  };
}

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  settings: LabSettingsSchema.catch(default_settings),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return { settings: default_settings() };
}
