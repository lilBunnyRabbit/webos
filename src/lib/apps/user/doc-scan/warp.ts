import { dark_mask, to_gray, type Rgba } from "$kit/utils/perspective";

export const PageFilter = { COLOR: "color", GRAY: "gray", BW: "bw" } as const;
export type PageFilter = (typeof PageFilter)[keyof typeof PageFilter];

export const FILTER_LABELS: Record<PageFilter, string> = { color: "Color", gray: "Gray", bw: "B&W" };

/** Long side of a straightened page: about 250 dpi on A4, sharp in print, small enough for a phone to warp. */
export const MAX_SIDE = 2400;

function percentile(values: Uint8Array, fraction: number): number {
  const counts = new Uint32Array(256);
  for (const value of values) counts[value]++;
  const target = values.length * fraction;
  let seen = 0;
  for (let value = 0; value < 256; value++) {
    seen += counts[value];
    if (seen >= target) return value;
  }
  return 255;
}

/**
 * Color stays as photographed. Gray stretches the paper (the 90th percentile) to white and the darkest ink to black.
 * B&W is the adaptive threshold: ink is what's darker than its surroundings, so a shadow across the page stays white.
 */
export function apply_filter(image: Rgba, filter: PageFilter): Rgba {
  if (filter === PageFilter.COLOR) return image;
  const gray = to_gray(image.data, image.width, image.height);
  const out = new Uint8ClampedArray(image.data.length);
  if (filter === PageFilter.BW) {
    const ink = dark_mask(gray, 0.78, Math.max(8, Math.round(Math.max(image.width, image.height) / 40)));
    for (let index = 0; index < ink.length; index++) put(out, index, ink[index] ? 0 : 255);
    return { ...image, data: out };
  }
  const white = Math.max(1, percentile(gray.data, 0.9));
  const black = Math.min(white - 1, percentile(gray.data, 0.01));
  const range = white - black;
  for (let index = 0; index < gray.data.length; index++) put(out, index, ((gray.data[index] - black) * 255) / range);
  return { ...image, data: out };
}

function put(data: Uint8ClampedArray, index: number, value: number): void {
  const at = index * 4;
  data[at] = data[at + 1] = data[at + 2] = value;
  data[at + 3] = 255;
}
