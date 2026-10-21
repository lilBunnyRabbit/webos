import type { Contour } from "./outline";

export interface Kerning {
  auto: boolean;
  pairs?: Record<string, number>;
}

export interface Profiled {
  contours: Contour[];
  advance: number;
}

export interface Profile {
  left: Float64Array;
  right: Float64Array;
  advance: number;
}

export const BAND = 20;
const BAND_FLOOR = -1000;
const BAND_COUNT = 120;
/** How far past the closest point the mean gap still looks, so a round side's hollow doesn't pull the pair in. */
export const DEPTH = 80;
export const MIN_SHARE = 0.6;
export const STRENGTH = 0.7;
export const CLEARANCE = 0.6;
export const MIN_KERN = 10;
export const MAX_KERN = 120;
export const KERN_STEP = 10;
export const MAX_MANUAL_KERN = 400;

export function glyph_profile(glyph: Profiled): Profile {
  const left = new Float64Array(BAND_COUNT).fill(NaN);
  const right = new Float64Array(BAND_COUNT).fill(NaN);
  const mark = (band: number, x: number) => {
    if (band < 0 || band >= BAND_COUNT) return;
    if (!(left[band] <= x)) left[band] = x;
    if (!(right[band] >= x)) right[band] = x;
  };
  for (const contour of glyph.contours) {
    for (let index = 0; index < contour.length; index++) {
      const a = contour[index];
      const b = contour[(index + 1) % contour.length];
      const low = Math.min(a.y, b.y);
      const high = Math.max(a.y, b.y);
      const first = Math.floor((low - BAND_FLOOR) / BAND);
      const last = Math.floor((high - BAND_FLOOR) / BAND);
      for (let band = first; band <= last; band++) {
        if (a.y === b.y) {
          mark(band, a.x);
          mark(band, b.x);
          continue;
        }
        const from = Math.max(low, BAND_FLOOR + band * BAND);
        const to = Math.min(high, BAND_FLOOR + (band + 1) * BAND);
        const x_at = (y: number) => a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
        mark(band, x_at(from));
        mark(band, x_at(to));
      }
    }
  }
  return { left, right, advance: glyph.advance };
}

// Only bands where both glyphs have ink count: "To" may tuck the o under the bar because the bar's band has no o.
export function pair_kern(left: Profile, right: Profile, target: number): number {
  const gaps: number[] = [];
  for (let band = 0; band < BAND_COUNT; band++) {
    const a = left.right[band];
    const b = right.left[band];
    if (Number.isNaN(a) || Number.isNaN(b)) continue;
    gaps.push(left.advance - a + b);
  }
  if (!gaps.length) return 0;
  const closest = Math.min(...gaps);
  const mean = gaps.reduce((sum, gap) => sum + Math.min(gap, closest + DEPTH), 0) / gaps.length;
  const seen = MIN_SHARE * closest + (1 - MIN_SHARE) * mean;
  let kern = STRENGTH * (target - seen);
  kern = Math.max(kern, CLEARANCE * target - closest);
  return Math.round(Math.min(MAX_KERN, Math.max(-MAX_KERN, kern)));
}

/** Letters, digits and punctuation without a decomposition: accented letters would mostly repeat their base's pairs. */
export function kerning_candidate(char: string): boolean {
  return /^[\p{L}\p{Nd}\p{P}]$/u.test(char) && char.normalize("NFD") === char;
}

const is_digit = (char: string) => /^\p{Nd}$/u.test(char);
const is_punctuation = (char: string) => /^\p{P}$/u.test(char);

// Tabular figures stay tabular; punctuation next to punctuation is rare and would crowd out letter pairs.
const kerned_together = (first: string, second: string) =>
  !(is_digit(first) && is_digit(second)) && !(is_punctuation(first) && is_punctuation(second));

function auto_value(left: Profile, right: Profile, target: number): number {
  const kern = pair_kern(left, right, target);
  return Math.abs(kern) >= MIN_KERN ? kern : 0;
}

export function auto_pair_kern(first: string, second: string, left: Profiled, right: Profiled, target: number): number {
  if (!kerning_candidate(first) || !kerning_candidate(second) || !kerned_together(first, second)) return 0;
  return auto_value(glyph_profile(left), glyph_profile(right), target);
}

export function auto_kerning(glyphs: ReadonlyMap<string, Profiled>, target: number, limit = Infinity): Map<string, number> {
  const profiles = [...glyphs].filter(([char]) => kerning_candidate(char)).map(([char, glyph]) => [char, glyph_profile(glyph)] as const);
  const found: [string, number][] = [];
  for (const [first, left] of profiles) {
    for (const [second, right] of profiles) {
      if (!kerned_together(first, second)) continue;
      const kern = auto_value(left, right, target);
      if (kern) found.push([first + second, kern]);
    }
  }
  if (found.length > limit) found.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || (a[0] < b[0] ? -1 : 1));
  return new Map(found.slice(0, limit));
}

export function pair_chars(pair: string): [string, string] | null {
  const chars = [...pair];
  return chars.length === 2 ? [chars[0], chars[1]] : null;
}

export function face_kerning(kerning: Kerning | undefined, glyphs: ReadonlyMap<string, Profiled>, target: number, limit: number): Map<string, number> {
  if (!kerning) return new Map();
  const manual = Object.entries(kerning.pairs ?? {}).filter(([pair, value]) => {
    const chars = pair_chars(pair);
    return value !== 0 && !!chars && glyphs.has(chars[0]) && glyphs.has(chars[1]);
  });
  const auto = kerning.auto ? auto_kerning(glyphs, target, Math.max(0, limit - manual.length)) : new Map<string, number>();
  for (const [pair, value] of manual) {
    const total = (auto.get(pair) ?? 0) + value;
    if (total) auto.set(pair, total);
    else auto.delete(pair);
  }
  return auto;
}

export function kerning_target(bearing: number): number {
  return 2 * bearing;
}
