import { MIN_SIDE } from "./file";
import { BW_PALETTE, differences, from_solution, is_settled, solve, Verdict, type Analysis, type Ink } from "./puzzle";

export const IMPORT_SIDE = { min: 10, max: 30, initial: 15 } as const;
export const IMPORT_COLOURS = [2, 3, 4] as const;
export const MAX_ROUNDS = 60;

export type Rgb = readonly [number, number, number];
export type Lab = readonly [number, number, number];

export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export interface Picture {
  width: number;
  height: number;
  palette: readonly Ink[];
  cells: number[];
  /** `costs[index * (palette.length + 1) + value]`: how far a cell's colour is from showing as `value`. */
  costs: Float64Array;
}

export function grid_size(image_width: number, image_height: number, long: number): { width: number; height: number } {
  const short = (side: number, other: number) => Math.min(long, Math.max(MIN_SIDE, Math.round((long * side) / other)));
  return image_width >= image_height
    ? { width: long, height: short(image_height, image_width) }
    : { width: short(image_width, image_height), height: long };
}

/** Transparency reads as white, the colour of an empty cell. */
export function downscale(pixels: Pixels, width: number, height: number): Rgb[] {
  const cells: Rgb[] = [];
  for (let row = 0; row < height; row++) {
    const y0 = Math.floor((row * pixels.height) / height);
    const y1 = Math.max(y0 + 1, Math.floor(((row + 1) * pixels.height) / height));
    for (let col = 0; col < width; col++) {
      const x0 = Math.floor((col * pixels.width) / width);
      const x1 = Math.max(x0 + 1, Math.floor(((col + 1) * pixels.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const at = (y * pixels.width + x) * 4;
          const alpha = pixels.data[at + 3] / 255;
          const white = 255 * (1 - alpha);
          r += pixels.data[at] * alpha + white;
          g += pixels.data[at + 1] * alpha + white;
          b += pixels.data[at + 2] * alpha + white;
        }
      }
      const count = (y1 - y0) * (x1 - x0);
      cells.push([r / count, g / count, b / count]);
    }
  }
  return cells;
}

export function luminance([r, g, b]: Rgb): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}

export function otsu(values: readonly number[]): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of values) histogram[Math.min(255, Math.max(0, Math.round(value)))]++;
  const total = values.length;
  const sum = histogram.reduce((acc, count, value) => acc + count * value, 0);
  let below = 0;
  let below_sum = 0;
  let best = -1;
  let threshold = 127;
  for (let value = 0; value < 255; value++) {
    below += histogram[value];
    below_sum += histogram[value] * value;
    const above = total - below;
    if (!below || !above) continue;
    const spread = below * above * (below_sum / below - (sum - below_sum) / above) ** 2;
    if (spread > best) [best, threshold] = [spread, value];
  }
  return threshold;
}

const linear = (channel: number) => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export function to_oklab([red, green, blue]: Rgb): Lab {
  const [r, g, b] = [linear(red), linear(green), linear(blue)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function distance(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Farthest-first seeding instead of random, so the same image always gives the same picture. */
export function kmeans(points: readonly Lab[], k: number, iterations = 30): { centres: Lab[]; labels: number[] } {
  let centres: Lab[] = [points.reduce((lightest, point) => (point[0] > lightest[0] ? point : lightest), points[0])];
  while (centres.length < k) {
    let far = points[0];
    let far_distance = -1;
    for (const point of points) {
      const nearest = Math.min(...centres.map((centre) => distance(point, centre)));
      if (nearest > far_distance) [far, far_distance] = [point, nearest];
    }
    centres.push(far);
  }
  let labels: number[] = [];
  for (let round = 0; round < iterations; round++) {
    const next = points.map((point) => nearest_index(point, centres));
    if (next.every((label, index) => label === labels[index])) break;
    labels = next;
    centres = centres.map((centre, cluster) => {
      const members = points.filter((_, index) => labels[index] === cluster);
      if (!members.length) return centre;
      const sum = members.reduce<[number, number, number]>(
        (acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]],
        [0, 0, 0]
      );
      return [sum[0] / members.length, sum[1] / members.length, sum[2] / members.length];
    });
  }
  return { centres, labels };
}

function nearest_index(point: Lab, centres: readonly Lab[]): number {
  let best = 0;
  for (let index = 1; index < centres.length; index++) {
    if (distance(point, centres[index]) < distance(point, centres[best])) best = index;
  }
  return best;
}

export function assign_inks(colours: readonly Lab[], inks: readonly { ink: Ink; lab: Lab }[]): Ink[] {
  let best: { inks: Ink[]; cost: number } = { inks: [], cost: Infinity };
  const walk = (index: number, picked: Ink[], cost: number) => {
    if (cost >= best.cost) return;
    if (index === colours.length) {
      best = { inks: picked, cost };
      return;
    }
    for (const { ink, lab } of inks) {
      if (!picked.includes(ink)) walk(index + 1, [...picked, ink], cost + distance(colours[index], lab));
    }
  };
  walk(0, [], 0);
  return best.inks;
}

export function bw_picture(cells: readonly Rgb[], width: number, height: number, threshold: number): Picture {
  const costs = new Float64Array(cells.length * 2);
  const picture = cells.map((rgb, index) => {
    const offset = luminance(rgb) - threshold - 0.5;
    costs[index * 2] = Math.max(0, -offset);
    costs[index * 2 + 1] = Math.max(0, offset);
    return offset < 0 ? 1 : 0;
  });
  return { width, height, palette: BW_PALETTE, cells: picture, costs };
}

/** `colours` counts the empty cells: the lightest cluster stays empty, the rest take the nearest inks. */
export function colour_picture(
  cells: readonly Rgb[],
  width: number,
  height: number,
  colours: number,
  inks: readonly { ink: Ink; lab: Lab }[]
): Picture {
  const points = cells.map(to_oklab);
  const { centres, labels } = kmeans(points, colours);
  const background = centres.reduce(
    (lightest, centre, index) => (centre[0] > centres[lightest][0] ? index : lightest),
    0
  );
  const order = centres.map((_, index) => index).filter((index) => index !== background);
  const palette = assign_inks(
    order.map((index) => centres[index]),
    inks
  );
  const value_of = new Map([[background, 0], ...order.map((cluster, index): [number, number] => [cluster, index + 1])]);
  const shown: Lab[] = [centres[background], ...order.map((index) => centres[index])];
  const costs = new Float64Array(cells.length * colours);
  points.forEach((point, index) =>
    shown.forEach((centre, value) => (costs[index * colours + value] = distance(point, centre)))
  );
  return { width, height, palette, cells: labels.map((label) => value_of.get(label) ?? 0), costs };
}

export function undecided(picture: Pick<Picture, "width" | "height" | "palette">, cells: readonly number[]): number[] {
  const { width, height, palette } = picture;
  const { rows, cols } = from_solution(0, width, height, palette, cells);
  const solved = solve(width, height, palette.length, rows, cols);
  return solved ? solved.flatMap((options, index) => (is_settled(options) ? [] : [index])) : [];
}

/** A cell changes at most once, so flips can't undo each other and the search ends. */
export function pick_flips(
  picture: Picture,
  cells: readonly number[],
  candidates: readonly number[],
  alternative: readonly number[] | null,
  tried: ReadonlySet<number>,
  count = 1
): { index: number; value: number }[] {
  const values = picture.palette.length + 1;
  const flips: { index: number; value: number; cost: number }[] = [];
  for (const index of candidates) {
    if (tried.has(index)) continue;
    const current = picture.costs[index * values + cells[index]];
    const options = alternative ? [alternative[index]] : Array.from({ length: values }, (_, value) => value);
    let best: { index: number; value: number; cost: number } | null = null;
    for (const value of options) {
      if (value === cells[index]) continue;
      const cost = picture.costs[index * values + value] - current;
      if (!best || cost < best.cost) best = { index, value, cost };
    }
    if (best) flips.push(best);
  }
  return flips
    .sort((a, b) => a.cost - b.cost)
    .slice(0, count)
    .map(({ index, value }) => ({ index, value }));
}

export interface UniqueResult {
  cells: number[];
  verdict: Verdict;
  flipped: number[];
}

export function is_unique(verdict: Verdict): boolean {
  return verdict === Verdict.LOGIC || verdict === Verdict.UNIQUE;
}

/** `run` rejects to stop. */
export async function make_unique(
  picture: Picture,
  run: (cells: readonly number[]) => Promise<Analysis>,
  on_round?: (cells: readonly number[], flipped: readonly number[]) => void
): Promise<UniqueResult> {
  const cells = [...picture.cells];
  const flipped: number[] = [];
  const tried = new Set<number>();
  for (let round = 0; ; round++) {
    const analysis = await run(cells);
    if (is_unique(analysis.verdict) || round >= MAX_ROUNDS) return { cells, verdict: analysis.verdict, flipped };
    const [first, second] = analysis.solutions;
    const multiple = analysis.verdict === Verdict.MULTIPLE;
    const candidates = multiple ? differences(first, second) : undecided(picture, cells);
    const alternative = multiple
      ? cells.map((cell, index) => (first[index] !== cell ? first[index] : second[index]))
      : null;
    // A search that ran out of time leaves many cells open, and one flip per slow round would take minutes.
    const count = multiple ? 1 : Math.ceil(candidates.length / 8);
    const flips = pick_flips(picture, cells, candidates, alternative, tried, count);
    if (!flips.length) return { cells, verdict: analysis.verdict, flipped };
    for (const { index, value } of flips) {
      cells[index] = value;
      tried.add(index);
      flipped.push(index);
    }
    on_round?.(cells, flipped);
  }
}
