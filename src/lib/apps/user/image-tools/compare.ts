import { Pyramid, align, compare, coverage, find_regions, type Alignment, type DiffMap, type Pixels, type Rect } from "./patch";

export interface CompareStats {
  changed: number;
  regions: number;
  alignment: Alignment;
  match: number;
}

export const tolerance_level = (percent: number) => (percent * 255) / 100;

/** Only cells the first image reaches count: outside it there is nothing to compare against. */
export function changed_percent(diff: DiffMap, tolerance: number, covered: Rect | null): number {
  if (!covered) return 100;
  const { data, width, height, factor } = diff;
  let inside = 0;
  let changed = 0;
  for (let y = 0; y < height; y++) {
    const cy = (y + 0.5) * factor;
    if (cy < covered.y || cy >= covered.y + covered.height) continue;
    for (let x = 0; x < width; x++) {
      const cx = (x + 0.5) * factor;
      if (cx < covered.x || cx >= covered.x + covered.width) continue;
      inside++;
      if (data[y * width + x] > tolerance) changed++;
    }
  }
  return inside ? Math.round((changed / inside) * 10_000) / 100 : 100;
}

export function compare_images(before: Pixels, after: Pixels, tolerance_percent: number, match_colors = true): CompareStats {
  const original = new Pyramid(before);
  const edited = new Pyramid(after);
  const { alignment, match } = align(original, edited);
  const { diff } = compare(original, edited, alignment, match_colors);
  const level = tolerance_level(tolerance_percent);
  return {
    changed: changed_percent(diff, level, coverage(alignment, before, after)),
    regions: find_regions(diff, level).length,
    alignment,
    match,
  };
}
