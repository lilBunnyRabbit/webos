import { z } from "zod";

export const SOURCES = ["mic", "screen", "camera"] as const;

export const RECORDER_PROPS = z.object({
  source: z.enum(SOURCES).optional(),
});
export type RecorderProps = z.infer<typeof RECORDER_PROPS>;
