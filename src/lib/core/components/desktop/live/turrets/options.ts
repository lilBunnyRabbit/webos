import { z } from "zod";

export const TurretsMode = {
  SHIELD: "shield",
  FOLLOW: "follow",
} as const;
export type TurretsMode = (typeof TurretsMode)[keyof typeof TurretsMode];

export const TurretsPace = {
  CHILL: "chill",
  NORMAL: "normal",
  FRANTIC: "frantic",
} as const;
export type TurretsPace = (typeof TurretsPace)[keyof typeof TurretsPace];

export interface TurretsOptions {
  mode: TurretsMode;
  pace: TurretsPace;
  sound: boolean;
  volume: number;
  damage: boolean;
}

export const DEFAULT_TURRETS_OPTIONS: TurretsOptions = { mode: TurretsMode.SHIELD, pace: TurretsPace.NORMAL, sound: false, volume: 0.5, damage: false };

// Each field falls back on its own, so a missing or broken one doesn't reset the rest.
export const turrets_options = z.object({
  mode: z.enum(Object.values(TurretsMode)).catch(DEFAULT_TURRETS_OPTIONS.mode),
  pace: z.enum(Object.values(TurretsPace)).catch(DEFAULT_TURRETS_OPTIONS.pace),
  sound: z.boolean().catch(DEFAULT_TURRETS_OPTIONS.sound),
  volume: z.number().min(0).max(1).catch(DEFAULT_TURRETS_OPTIONS.volume),
  damage: z.boolean().catch(DEFAULT_TURRETS_OPTIONS.damage),
});
