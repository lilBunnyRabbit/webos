import type { Color } from "@lilbunnyrabbit/chromatics";
import { Hsv } from "@lilbunnyrabbit/chromatics/hsv";
import { Lab65 } from "@lilbunnyrabbit/chromatics/lab65";
import { Oklch } from "@lilbunnyrabbit/chromatics/oklch";
import { Srgb } from "@lilbunnyrabbit/chromatics/srgb";
import { Srgb8 } from "@lilbunnyrabbit/chromatics/srgb8";

// Per-model subpaths keep an importing app's bundle to the models it reaches; `models.ts` parses any syntax and pulls in all 70.

export type { Color };

/** A hex or named colour (what `Srgb8` reads), or a package colour in any model. */
export type ColorInput = Color | string;

/** OKLCH as the package keeps it: `l` 0–1, `c` 0–0.4 (unbounded), `h` degrees; alpha 0–1. */
export interface OklchValue {
  l: number;
  c: number;
  h: number;
  alpha: number;
}

export interface HsvValue {
  h: number;
  s: number;
  v: number;
  alpha: number;
}

export interface Lab65Value {
  l: number;
  a: number;
  b: number;
  alpha: number;
}

function color_of(input: ColorInput): Color {
  return typeof input === "string" ? Srgb8.parse(input.trim()) : input;
}

export function from_hex(hex: string): Color | null {
  try {
    return Srgb8.parse(hex.trim());
  } catch {
    return null;
  }
}

export function oklch(l: number, c: number, h: number, alpha = 1): Color {
  return new Oklch(l, c, h, alpha);
}

export function hsv(h: number, s: number, v: number, alpha = 1): Color {
  return new Hsv(h, s, v, alpha);
}

export function lab65(l: number, a: number, b: number, alpha = 1): Color {
  return new Lab65(l, a, b, alpha);
}

export function rgb8(r: number, g: number, b: number, alpha = 255): Color {
  return new Srgb8(r, g, b, alpha);
}

export function to_oklch(input: ColorInput): OklchValue {
  const { l, c, h, alpha } = color_of(input).to(Oklch);
  return { l, c, h, alpha };
}

export function to_hsv(input: ColorInput): HsvValue {
  const { h, s, v, alpha } = color_of(input).to(Hsv);
  return { h, s, v, alpha };
}

export function to_lab65(input: ColorInput): Lab65Value {
  const { l, a, b, alpha } = color_of(input).to(Lab65);
  return { l, a, b, alpha };
}

/** What a screen shows: sRGB through CSS Color 4 gamut mapping (lightness and hue kept, chroma given up). */
export function to_display_srgb(input: ColorInput): Srgb {
  return color_of(input).to(Srgb).gamutMap();
}

/** `#rrggbb`, or `#rrggbbaa` when translucent, after gamut mapping. Never fails on an out-of-gamut colour. */
export function to_hex(input: ColorInput): string {
  return to_display_srgb(input).to(Srgb8).toHex();
}

export function in_srgb_gamut(input: ColorInput): boolean {
  return color_of(input).to(Srgb).inGamut();
}

/** CIEDE2000 between two colours, in Lab D65. About 1 is the smallest difference most people see. */
export function delta_e2000(a: ColorInput, b: ColorInput): number {
  return color_of(a).to(Lab65).deltaE2000(color_of(b).to(Lab65));
}

/**
 * The WCAG 2 contrast ratio (1–21) of text in `foreground` on `background`, both as the screen shows them. A
 * translucent foreground is composited over the background first; the background counts as opaque.
 */
export function contrast_ratio(foreground: ColorInput, background: ColorInput): number {
  const back = to_display_srgb(background).set({ alpha: 1 });
  return to_display_srgb(foreground).over(back).contrast(back);
}
