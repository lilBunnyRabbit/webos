import { AppearanceMotion, AppearanceRadius, type Appearance } from "./type";

export const DEFAULT_APPEARANCE: Appearance = { radius: AppearanceRadius.DEFAULT, motion: AppearanceMotion.SYSTEM };

/** Multiplier on every `@theme` radius except `rounded-full`, written as `--radius-scale` on `<html>`. */
export const RADIUS_SCALE: Record<AppearanceRadius, number> = {
  sharp: 0.4,
  default: 1,
  round: 1.5,
};
