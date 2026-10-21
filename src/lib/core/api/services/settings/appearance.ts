import { DEFAULT_APPEARANCE_FONT } from "./fonts";
import { AppearanceMotion, AppearanceRadius, AppearanceShadow, AppearanceText, type Appearance } from "./type";

export const DEFAULT_APPEARANCE: Appearance = {
  radius: AppearanceRadius.DEFAULT,
  motion: AppearanceMotion.SYSTEM,
  shadow: AppearanceShadow.DEFAULT,
  text: AppearanceText.M,
  font: DEFAULT_APPEARANCE_FONT,
};

/** Multiplier on every `@theme` radius except `rounded-full`, written as `--radius-scale` on `<html>`. */
export const RADIUS_SCALE: Record<AppearanceRadius, number> = {
  sharp: 0.4,
  default: 1,
  round: 1.5,
};

/** Multiplier on the darkest-shade opacity of every `@theme` shadow, written as `--shadow-strength`. The hairline in `shadow-popover` isn't scaled. */
export const SHADOW_STRENGTH: Record<AppearanceShadow, number> = {
  none: 0,
  subtle: 0.5,
  default: 1,
  strong: 1.4,
};

/** Root font-size multiplier, written as `--text-scale`: 15, 16 and 17px at the browser's default 16px. */
export const TEXT_SCALE: Record<AppearanceText, number> = {
  s: 0.9375,
  m: 1,
  l: 1.0625,
};
