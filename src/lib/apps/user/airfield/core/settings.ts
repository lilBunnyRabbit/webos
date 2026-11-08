import { z } from "zod";
import { ONSCREEN_MODES, OnScreen } from "$kit/games/play2d/onscreen";
import { PitchMode } from "./controls.svelte";
import { PLANE_IDS, PlaneId } from "./planes";

export const SETTINGS_FILE = "settings.json";

export const settings_schema = z.object({
  plane: z.enum(PLANE_IDS).catch(PlaneId.TRAINER),
  pitch: z.enum([PitchMode.GAME, PitchMode.PILOT]).catch(PitchMode.PILOT),
  sound: z.boolean().catch(true),
  onscreen: z.enum(ONSCREEN_MODES).catch(OnScreen.AUTO),
  seen_hint: z.boolean().catch(false),
});
export type Settings = z.infer<typeof settings_schema>;

export const DEFAULT_SETTINGS: Settings = { plane: PlaneId.TRAINER, pitch: PitchMode.PILOT, sound: true, onscreen: OnScreen.AUTO, seen_hint: false };
