import { z } from "zod";
import { SKIP_SENSITIVITY } from "./skip";

/** `/var/lib/apps/video-tools/settings.json`. */
export const SETTINGS_FILE = "settings.json";

export interface VideoToolsSettings {
  version: 1;
  skip_sensitivity: number;
}

export const DEFAULT_SETTINGS: VideoToolsSettings = { version: 1, skip_sensitivity: SKIP_SENSITIVITY.DEFAULT };

export const SettingsSchema: z.ZodType<VideoToolsSettings> = z.object({
  version: z.literal(1),
  skip_sensitivity: z.number().min(SKIP_SENSITIVITY.MIN).max(SKIP_SENSITIVITY.MAX),
});
