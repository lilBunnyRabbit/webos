import type { Theme, ThemeBase } from "./type";

/** Hue offsets for primary, secondary and accent around the base hue. */
const HARMONIES: Record<string, [number, number, number]> = {
  analogous: [0, 30, -30],
  complementary: [0, 180, 30],
  triadic: [0, 120, 240],
  split: [0, 150, 210],
};

interface Ranges {
  background: { l: [number, number]; c: [number, number] };
  foreground: { l: [number, number]; c: [number, number] };
  colours: { l: [number, number]; c: [number, number] };
}

// Ranges keep text 0.55+ and accents 0.35+ lightness away from the background, so every result stays readable.
const DARK: Ranges = {
  background: { l: [0.16, 0.3], c: [0.01, 0.04] },
  foreground: { l: [0.86, 0.93], c: [0.005, 0.02] },
  colours: { l: [0.7, 0.8], c: [0.07, 0.14] },
};
const LIGHT: Ranges = {
  background: { l: [0.93, 0.96], c: [0.008, 0.03] },
  foreground: { l: [0.2, 0.32], c: [0.01, 0.025] },
  colours: { l: [0.45, 0.56], c: [0.08, 0.15] },
};

export const MIN_TEXT_CONTRAST = 0.55;
export const MIN_COLOUR_CONTRAST = 0.35;

const oklch = (l: number, c: number, h: number) => `oklch(${l.toFixed(3)} ${c.toFixed(4)} ${(((h % 360) + 360) % 360).toFixed(2)})`;

/** Lightness of an `oklch(…)` value, `null` for anything else. */
export function oklch_lightness(value: string): number | null {
  const match = value.match(/^oklch\(\s*([\d.]+)(%?)/);
  if (!match) return null;
  return Number(match[1]) / (match[2] ? 100 : 1);
}

/** Dark unless the background is clearly light; values the parser can't read count as dark, the brand default. */
export function is_dark(theme: Pick<Theme, "background">): boolean {
  return (oklch_lightness(theme.background) ?? 0) < 0.6;
}

/**
 * Five base colours under rules (ADR-015 revision): the mode stays, one base hue and a harmony pick the three colours,
 * the background is a low-chroma tint of the base, the foreground a near-neutral of the opposite hue.
 */
export function random_theme(dark: boolean, rand: () => number = Math.random): ThemeBase {
  const ranges = dark ? DARK : LIGHT;
  const between = ([min, max]: [number, number]) => min + rand() * (max - min);
  const hue = rand() * 360;
  const names = Object.keys(HARMONIES);
  const [p, s, a] = HARMONIES[names[Math.floor(rand() * names.length)]];
  const colour = (offset: number) => oklch(between(ranges.colours.l), between(ranges.colours.c), hue + offset);
  return {
    background: oklch(between(ranges.background.l), between(ranges.background.c), hue),
    foreground: oklch(between(ranges.foreground.l), between(ranges.foreground.c), hue + 180),
    primary: colour(p),
    secondary: colour(s),
    accent: colour(a),
  };
}
