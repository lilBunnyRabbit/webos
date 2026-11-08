import { z } from "zod";
import { CLIP_FORMATS, ClipFormat, OUTPUT_SIZES, OutputSize } from "$kit/utils/video/plan";
import { SKIP_SENSITIVITY } from "./skip";

/** `/var/lib/apps/video-tools/settings.json`. */
export const SETTINGS_FILE = "settings.json";

export interface VideoToolsSettings {
  version: 2;
  skip_sensitivity: number;
  format: ClipFormat;
  size: OutputSize;
}

export const DEFAULT_SETTINGS: VideoToolsSettings = {
  version: 2,
  skip_sensitivity: SKIP_SENSITIVITY.DEFAULT,
  format: ClipFormat.WEBM,
  size: OutputSize.ORIGINAL,
};

const sensitivity = z.number().min(SKIP_SENSITIVITY.MIN).max(SKIP_SENSITIVITY.MAX);

const SettingsV2 = z.object({
  version: z.literal(2),
  skip_sensitivity: sensitivity,
  format: z.enum(CLIP_FORMATS),
  size: z.enum(OUTPUT_SIZES),
});

const SettingsV1 = z.object({ version: z.literal(1), skip_sensitivity: sensitivity });

export const SettingsSchema: z.ZodType<VideoToolsSettings> = z.union([
  SettingsV2,
  SettingsV1.transform(({ skip_sensitivity }): VideoToolsSettings => ({ ...DEFAULT_SETTINGS, skip_sensitivity })),
]);
