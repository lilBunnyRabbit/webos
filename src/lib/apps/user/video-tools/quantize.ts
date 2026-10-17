const BITS = 5;
const SIDE = 1 << BITS;
const SHIFT = 8 - BITS;

const bin = (r: number, g: number, b: number) => ((r >> SHIFT) << (2 * BITS)) | ((g >> SHIFT) << BITS) | (b >> SHIFT);

interface Histogram {
  count: Uint32Array;
  sum: Float64Array;
}

function histogram(rgba: Uint8ClampedArray | Uint8Array): Histogram {
  const count = new Uint32Array(SIDE ** 3);
  const sum = new Float64Array(SIDE ** 3 * 3);
  for (let i = 0; i < rgba.length; i += 4) {
    const index = bin(rgba[i], rgba[i + 1], rgba[i + 2]);
    count[index]++;
    sum[index * 3] += rgba[i];
    sum[index * 3 + 1] += rgba[i + 1];
    sum[index * 3 + 2] += rgba[i + 2];
  }
  return { count, sum };
}

interface Box {
  /** Inclusive bin ranges: r0, r1, g0, g1, b0, b1. */
  range: number[];
  population: number;
}

function* bins_in(range: readonly number[]): Generator<number> {
  for (let r = range[0]; r <= range[1]; r++)
    for (let g = range[2]; g <= range[3]; g++)
      for (let b = range[4]; b <= range[5]; b++) yield (r << (2 * BITS)) | (g << BITS) | b;
}

function shrink(range: readonly number[], count: Uint32Array): Box {
  const next = [SIDE, -1, SIDE, -1, SIDE, -1];
  let population = 0;
  for (const index of bins_in(range)) {
    const n = count[index];
    if (!n) continue;
    population += n;
    const channels = [index >> (2 * BITS), (index >> BITS) & (SIDE - 1), index & (SIDE - 1)];
    for (let axis = 0; axis < 3; axis++) {
      next[axis * 2] = Math.min(next[axis * 2], channels[axis]);
      next[axis * 2 + 1] = Math.max(next[axis * 2 + 1], channels[axis]);
    }
  }
  return { range: population ? next : [...range], population };
}

function split(box: Box, count: Uint32Array): [Box, Box] | null {
  const spans = [0, 1, 2].map((axis) => box.range[axis * 2 + 1] - box.range[axis * 2]);
  const axis = spans.indexOf(Math.max(...spans));
  if (spans[axis] === 0) return null;
  const low = box.range[axis * 2];
  const high = box.range[axis * 2 + 1];
  const per_slice = new Float64Array(high - low + 1);
  for (const index of bins_in(box.range)) {
    const channel = axis === 0 ? index >> (2 * BITS) : axis === 1 ? (index >> BITS) & (SIDE - 1) : index & (SIDE - 1);
    per_slice[channel - low] += count[index];
  }
  let seen = 0;
  let cut = low;
  for (let i = 0; i < per_slice.length - 1; i++) {
    seen += per_slice[i];
    cut = low + i;
    if (seen >= box.population / 2) break;
  }
  const left = [...box.range];
  const right = [...box.range];
  left[axis * 2 + 1] = cut;
  right[axis * 2] = cut + 1;
  return [shrink(left, count), shrink(right, count)];
}

/** Packed RGB triplets, each the mean of the pixels in its box. */
export function median_cut(rgba: Uint8ClampedArray | Uint8Array, max_colors = 256): Uint8Array {
  const { count, sum } = histogram(rgba);
  const boxes = [shrink([0, SIDE - 1, 0, SIDE - 1, 0, SIDE - 1], count)];
  if (!boxes[0].population) return new Uint8Array(3);
  const done: Box[] = [];
  while (boxes.length && boxes.length + done.length < max_colors) {
    boxes.sort((a, b) => b.population - a.population);
    const box = boxes.shift()!;
    const halves = split(box, count);
    if (halves) boxes.push(...halves.filter((half) => half.population > 0));
    else done.push(box);
  }
  const all = [...done, ...boxes];
  const palette = new Uint8Array(all.length * 3);
  all.forEach((box, i) => {
    const total = [0, 0, 0];
    for (const index of bins_in(box.range)) {
      total[0] += sum[index * 3];
      total[1] += sum[index * 3 + 1];
      total[2] += sum[index * 3 + 2];
    }
    for (let c = 0; c < 3; c++) palette[i * 3 + c] = Math.round(total[c] / box.population);
  });
  return palette;
}

const LOOKUP_BITS = 6;
const LOOKUP_SHIFT = 8 - LOOKUP_BITS;

export class PaletteLookup {
  private readonly cache = new Int16Array(1 << (3 * LOOKUP_BITS)).fill(-1);

  constructor(private readonly palette: Uint8Array) {}

  nearest(r: number, g: number, b: number): number {
    const key = ((r >> LOOKUP_SHIFT) << (2 * LOOKUP_BITS)) | ((g >> LOOKUP_SHIFT) << LOOKUP_BITS) | (b >> LOOKUP_SHIFT);
    const known = this.cache[key];
    if (known >= 0) return known;
    let best = 0;
    let best_distance = Infinity;
    for (let i = 0; i < this.palette.length; i += 3) {
      const dr = this.palette[i] - r;
      const dg = this.palette[i + 1] - g;
      const db = this.palette[i + 2] - b;
      const distance = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
      if (distance < best_distance) {
        best_distance = distance;
        best = i / 3;
      }
    }
    this.cache[key] = best;
    return best;
  }
}

const clamp_byte = (value: number) => (value < 0 ? 0 : value > 255 ? 255 : Math.round(value));

/** Floyd–Steinberg runs in a serpentine: always scanning left to right drags the error into diagonal streaks. */
export function map_pixels(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  palette: Uint8Array,
  dither: boolean
): Uint8Array {
  const lookup = new PaletteLookup(palette);
  const out = new Uint8Array(width * height);
  if (!dither) {
    for (let i = 0; i < out.length; i++) out[i] = lookup.nearest(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
    return out;
  }
  let current = new Float32Array((width + 2) * 3);
  let next = new Float32Array((width + 2) * 3);
  for (let y = 0; y < height; y++) {
    const forward = y % 2 === 0;
    for (let step = 0; step < width; step++) {
      const x = forward ? step : width - 1 - step;
      const pixel = y * width + x;
      const at = (x + 1) * 3;
      const r = clamp_byte(rgba[pixel * 4] + current[at]);
      const g = clamp_byte(rgba[pixel * 4 + 1] + current[at + 1]);
      const b = clamp_byte(rgba[pixel * 4 + 2] + current[at + 2]);
      const index = lookup.nearest(r, g, b);
      out[pixel] = index;
      const error = [r - palette[index * 3], g - palette[index * 3 + 1], b - palette[index * 3 + 2]];
      const ahead = forward ? 3 : -3;
      for (let c = 0; c < 3; c++) {
        const e = error[c];
        current[at + ahead + c] += (e * 7) / 16;
        next[at - ahead + c] += (e * 3) / 16;
        next[at + c] += (e * 5) / 16;
        next[at + ahead + c] += e / 16;
      }
    }
    [current, next] = [next, current];
    next.fill(0);
  }
  return out;
}
