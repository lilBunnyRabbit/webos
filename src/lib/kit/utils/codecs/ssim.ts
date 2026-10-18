export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface SsimResult {
  score: number;
  /** Each window's SSIM, `map_width` × `map_height`, one per `SSIM_STEP` px. */
  map: Float32Array;
  map_width: number;
  map_height: number;
}

export const SSIM_WINDOW = 8;
export const SSIM_STEP = 4;
const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;

/** BT.601 luma, with transparency flattened onto white, the way JPEG output is. */
export function luminance({ width, height, data }: Pixels): Float32Array {
  const luma = new Float32Array(width * height);
  for (let index = 0; index < luma.length; index++) {
    const offset = index * 4;
    const alpha = data[offset + 3] / 255;
    const white = 255 * (1 - alpha);
    luma[index] =
      0.299 * (data[offset] * alpha + white) + 0.587 * (data[offset + 1] * alpha + white) + 0.114 * (data[offset + 2] * alpha + white);
  }
  return luma;
}

export function ssim(a: Pixels, b: Pixels): SsimResult {
  if (a.width !== b.width || a.height !== b.height) throw new Error("The images differ in size");
  const { width, height } = a;
  const window_width = Math.min(SSIM_WINDOW, width);
  const window_height = Math.min(SSIM_WINDOW, height);
  const map_width = Math.floor((width - window_width) / SSIM_STEP) + 1;
  const map_height = Math.floor((height - window_height) / SSIM_STEP) + 1;
  const map = new Float32Array(map_width * map_height);
  const count = window_width * window_height;
  const la = luminance(a);
  const lb = luminance(b);

  // Column sums over one band of rows, then each window adds up its columns: about 12 operations a pixel instead of 64.
  const sum_a = new Float64Array(width);
  const sum_b = new Float64Array(width);
  const sum_aa = new Float64Array(width);
  const sum_bb = new Float64Array(width);
  const sum_ab = new Float64Array(width);
  let total = 0;

  for (let row = 0; row < map_height; row++) {
    sum_a.fill(0);
    sum_b.fill(0);
    sum_aa.fill(0);
    sum_bb.fill(0);
    sum_ab.fill(0);
    const top = row * SSIM_STEP;
    for (let y = top; y < top + window_height; y++) {
      const line = y * width;
      for (let x = 0; x < width; x++) {
        const pa = la[line + x];
        const pb = lb[line + x];
        sum_a[x] += pa;
        sum_b[x] += pb;
        sum_aa[x] += pa * pa;
        sum_bb[x] += pb * pb;
        sum_ab[x] += pa * pb;
      }
    }
    for (let column = 0; column < map_width; column++) {
      const left = column * SSIM_STEP;
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let x = left; x < left + window_width; x++) {
        sa += sum_a[x];
        sb += sum_b[x];
        saa += sum_aa[x];
        sbb += sum_bb[x];
        sab += sum_ab[x];
      }
      const mean_a = sa / count;
      const mean_b = sb / count;
      const variance_a = Math.max(0, saa / count - mean_a * mean_a);
      const variance_b = Math.max(0, sbb / count - mean_b * mean_b);
      const covariance = sab / count - mean_a * mean_b;
      const value =
        ((2 * mean_a * mean_b + C1) * (2 * covariance + C2)) /
        ((mean_a * mean_a + mean_b * mean_b + C1) * (variance_a + variance_b + C2));
      map[row * map_width + column] = value;
      total += value;
    }
  }

  return { score: total / map.length, map, map_width, map_height };
}
