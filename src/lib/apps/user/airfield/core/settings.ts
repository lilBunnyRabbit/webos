import { z } from "zod";
import { PitchMode } from "./controls.svelte";
import { PLANE_IDS, PlaneId } from "./planes";

export const SETTINGS_FILE = "settings.json";

export const settings_schema = z.object({
  plane: z.enum(PLANE_IDS).catch(PlaneId.TRAINER),
  pitch: z.enum([PitchMode.GAME, PitchMode.PILOT]).catch(PitchMode.PILOT),
  sound: z.boolean().catch(true),
  seen_hint: z.boolean().catch(false),
});
export type Settings = z.infer<typeof settings_schema>;

export const DEFAULT_SETTINGS: Settings = { plane: PlaneId.TRAINER, pitch: PitchMode.PILOT, sound: true, seen_hint: false };
