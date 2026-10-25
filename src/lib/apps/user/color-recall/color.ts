import {
  clampChroma,
  converter,
  differenceCiede2000,
  formatHex,
  modeHsv,
  modeLab65,
  modeOklab,
  modeOklch,
  modeRgb,
  useMode,
} from "culori/fn";

useMode(modeRgb);
useMode(modeHsv);
useMode(modeLab65);
useMode(modeOklab);
useMode(modeOklch);

const to_hsv = converter("hsv");
const to_oklch = converter("oklch");
const ciede2000 = differenceCiede2000();

/** Hue 0–360, saturation and brightness 0–100: the sliders' scale. */
export interface Hsb {
  h: number;
  s: number;
  b: number;
}

/** OKLCH with lightness 0–100, so every slider reads in whole steps. */
export interface Lch {
  l: number;
  c: number;
  h: number;
}

export const Space = { HSB: "hsb", OKLCH: "oklch" } as const;
export type Space = (typeof Space)[keyof typeof Space];

export const OKLCH_MAX_CHROMA = 0.37;

export function wrap_hue(hue: number): number {
  return ((hue % 360) + 360) % 360;
}

export function hue_distance(a: number, b: number): number {
  const d = Math.abs(wrap_hue(a) - wrap_hue(b));
  return Math.min(d, 360 - d);
}

export function hsb_hex({ h, s, b }: Hsb): string {
  return formatHex({ mode: "hsv", h: wrap_hue(h), s: s / 100, v: b / 100 });
}

/** Out-of-gamut values keep their lightness and hue and lose chroma until sRGB can show them. */
export function lch_hex({ l, c, h }: Lch): string {
  return formatHex(clampChroma({ mode: "oklch", l: l / 100, c, h: wrap_hue(h) }, "oklch"));
}

export function hex_hsb(hex: string): Hsb {
  const color = to_hsv(hex);
  return { h: color?.h ?? 0, s: (color?.s ?? 0) * 100, b: (color?.v ?? 0) * 100 };
}

export function hex_lch(hex: string): Lch {
  const color = to_oklch(hex);
  return { l: (color?.l ?? 0) * 100, c: color?.c ?? 0, h: color?.h ?? 0 };
}

const steps = (count: number, at: (t: number) => string) => Array.from({ length: count }, (_, index) => at(index / (count - 1)));
const gradient = (colors: string[]) => `linear-gradient(to right, ${colors.join(", ")})`;

/** Each slider's track: what the colour becomes along that channel, the others held. */
export function hsb_tracks({ h, s, b }: Hsb): [string, string, string] {
  return [
    gradient(steps(13, (t) => hsb_hex({ h: t * 360, s, b }))),
    gradient(steps(2, (t) => hsb_hex({ h, s: t * 100, b }))),
    gradient(steps(2, (t) => hsb_hex({ h, s, b: t * 100 }))),
  ];
}

export function lch_tracks({ l, c, h }: Lch): [string, string, string] {
  return [
    gradient(steps(9, (t) => lch_hex({ l: t * 100, c, h }))),
    gradient(steps(9, (t) => lch_hex({ l, c: t * OKLCH_MAX_CHROMA, h }))),
    gradient(steps(13, (t) => lch_hex({ l, c, h: t * 360 }))),
  ];
}

export function color_difference(a: string, b: string): number {
  return ciede2000(a, b);
}
