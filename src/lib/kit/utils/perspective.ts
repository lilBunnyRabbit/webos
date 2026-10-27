import type { Point } from "./view";

export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

/** Corners clockwise from the top left. */
export type Quad = [Point, Point, Point, Point];
export type Matrix = number[];

export interface Region {
  area: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  cx: number;
  cy: number;
  edge: boolean;
}

export function to_gray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index++) {
    const at = index * 4;
    data[index] = Math.round(rgba[at] * 0.299 + rgba[at + 1] * 0.587 + rgba[at + 2] * 0.114);
  }
  return { width, height, data };
}

/**
 * Adaptive threshold: 1 where a pixel is darker than `ratio` of its neighbourhood's mean, so shading across a photo
 * doesn't turn into ink. The neighbourhood reaches `radius` pixels out, by default a sixteenth of the long side.
 */
export function dark_mask(gray: Gray, ratio = 0.72, radius = Math.max(4, Math.round(Math.max(gray.width, gray.height) / 16))): Uint8Array {
  const { width, height, data } = gray;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row;
    }
  }
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      if (data[y * width + x] < mean * ratio) mask[y * width + x] = 1;
    }
  }
  return mask;
}

export function regions(mask: Uint8Array, width: number, height: number): Region[] {
  return labelled(mask, width, height).regions;
}

/** `labels[i]` is the index into `regions` plus one, 0 off the mask. */
function labelled(mask: Uint8Array, width: number, height: number): { labels: Int32Array; regions: Region[] } {
  const labels = new Int32Array(mask.length);
  const stack = new Int32Array(mask.length);
  const out: Region[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const label = out.length + 1;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    const region: Region = { area: 0, x_min: width, y_min: height, x_max: 0, y_max: 0, cx: 0, cy: 0, edge: false };
    while (top) {
      const at = stack[--top];
      const x = at % width;
      const y = (at - x) / width;
      region.area++;
      region.cx += x;
      region.cy += y;
      if (x < region.x_min) region.x_min = x;
      if (x > region.x_max) region.x_max = x;
      if (y < region.y_min) region.y_min = y;
      if (y > region.y_max) region.y_max = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) region.edge = true;
      const neighbours = [x > 0 ? at - 1 : -1, x < width - 1 ? at + 1 : -1, y > 0 ? at - width : -1, y < height - 1 ? at + width : -1];
      for (const next of neighbours) {
        if (next < 0 || !mask[next] || labels[next]) continue;
        labels[next] = label;
        stack[top++] = next;
      }
    }
    region.cx /= region.area;
    region.cy /= region.area;
    out.push(region);
  }
  return { labels, regions: out };
}

export function homography(from: Quad, to: Quad): Matrix {
  const rows: number[][] = [];
  for (let index = 0; index < 4; index++) {
    const { x, y } = from[index];
    const { x: u, y: v } = to[index];
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let column = 0; column < 8; column++) {
    let pivot = column;
    for (let row = column + 1; row < 8; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-12) throw new Error("The corners don't form a quadrilateral");
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    for (let row = 0; row < 8; row++) {
      if (row === column) continue;
      const factor = rows[row][column] / rows[column][column];
      for (let k = column; k < 9; k++) rows[row][k] -= factor * rows[column][k];
    }
  }
  return [...rows.map((row, index) => row[8] / row[index]), 1];
}

export function project(matrix: Matrix, point: Point): Point {
  const w = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / w,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / w,
  };
}

/** Bilinear luma at a point in pixel coordinates (pixel centres at .5), clamped to the edges. */
export function sample(gray: Gray, x: number, y: number): number {
  const { width, height, data } = gray;
  const fx = Math.min(width - 1, Math.max(0, x - 0.5));
  const fy = Math.min(height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const top = data[y0 * width + x0] * (1 - tx) + data[y0 * width + x1] * tx;
  const bottom = data[y1 * width + x0] * (1 - tx) + data[y1 * width + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

export function default_quad(width: number, height: number): Quad {
  const dx = width * 0.08;
  const dy = height * 0.08;
  return [
    { x: dx, y: dy },
    { x: width - dx, y: dy },
    { x: width - dx, y: height - dy },
    { x: dx, y: height - dy },
  ];
}

/** The threshold that best splits the histogram in two (Otsu): the paper from the table behind it. */
export function otsu(gray: Gray): number {
  const histogram = new Float64Array(256);
  for (const value of gray.data) histogram[value]++;
  const total = gray.data.length;
  let sum = 0;
  for (let value = 0; value < 256; value++) sum += value * histogram[value];
  let below = 0;
  let below_sum = 0;
  let best = 0;
  let threshold = 127;
  for (let value = 0; value < 256; value++) {
    below += histogram[value];
    if (!below) continue;
    const above = total - below;
    if (!above) break;
    below_sum += value * histogram[value];
    const spread = below * above * (below_sum / below - (sum - below_sum) / above) ** 2;
    if (spread > best) {
      best = spread;
      threshold = value;
    }
  }
  return threshold;
}

export function quad_area(quad: Quad): number {
  let twice = 0;
  for (let index = 0; index < 4; index++) {
    const a = quad[index];
    const b = quad[(index + 1) % 4];
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) / 2;
}

/**
 * A sheet of paper on a darker background: the biggest bright region after an Otsu threshold, its corners the extremes
 * of x + y and x − y (top left, bottom right, top right, bottom left). `null` when no region stands out (paper on a
 * white desk, a photo filled by the page) or it isn't roughly four-sided, so the caller starts from `default_quad`.
 */
export function find_paper(gray: Gray): Quad | null {
  const { width, height, data } = gray;
  const threshold = otsu(gray);
  const mask = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index++) mask[index] = data[index] > threshold ? 1 : 0;
  const { labels, regions: found } = labelled(mask, width, height);
  if (!found.length) return null;
  const biggest = found.reduce((best, region, index) => (region.area > found[best].area ? index : best), 0);
  const paper = found[biggest];
  const area = width * height;
  if (paper.area < area * 0.1 || paper.area > area * 0.97) return null;

  const corners = { tl: [Infinity, 0], tr: [-Infinity, 0], br: [-Infinity, 0], bl: [Infinity, 0] };
  for (let index = 0; index < labels.length; index++) {
    if (labels[index] !== biggest + 1) continue;
    const x = index % width;
    const y = (index - x) / width;
    if (x + y < corners.tl[0]) corners.tl = [x + y, index];
    if (x + y > corners.br[0]) corners.br = [x + y, index];
    if (x - y > corners.tr[0]) corners.tr = [x - y, index];
    if (x - y < corners.bl[0]) corners.bl = [x - y, index];
  }
  const point = (index: number) => {
    const x = index % width;
    return { x: x + 0.5, y: (index - x) / width + 0.5 };
  };
  const quad: Quad = [point(corners.tl[1]), point(corners.tr[1]), point(corners.br[1]), point(corners.bl[1])];
  return quad_area(quad) >= paper.area * 0.75 ? quad : null;
}

export interface Rgba {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface Size {
  width: number;
  height: number;
}

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** The flat page's size from its longer opposite edges, at most `max_side` on the long side. */
export function page_size(quad: Quad, max_side = Infinity): Size {
  const [tl, tr, br, bl] = quad;
  const width = Math.max(distance(tl, tr), distance(bl, br));
  const height = Math.max(distance(tl, bl), distance(tr, br));
  const scale = Math.min(1, max_side / Math.max(width, height, 1));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The quad in `source` pulled flat into `size`, sampled bilinearly through the homography. */
export function warp(source: Rgba, quad: Quad, size: Size): Rgba {
  const { width, height } = size;
  const flat: Quad = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ];
  const matrix = homography(flat, quad);
  const out = new Uint8ClampedArray(width * height * 4);
  const { width: sw, height: sh, data } = source;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = project(matrix, { x: x + 0.5, y: y + 0.5 });
      const fx = Math.min(sw - 1, Math.max(0, point.x - 0.5));
      const fy = Math.min(sh - 1, Math.max(0, point.y - 0.5));
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = (y0 * sw + x0) * 4;
      const b = (y0 * sw + x1) * 4;
      const c = (y1 * sw + x0) * 4;
      const d = (y1 * sw + x1) * 4;
      const at = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const top = data[a + channel] * (1 - tx) + data[b + channel] * tx;
        const bottom = data[c + channel] * (1 - tx) + data[d + channel] * tx;
        out[at + channel] = top * (1 - ty) + bottom * ty;
      }
      out[at + 3] = 255;
    }
  }
  return { width, height, data: out };
}
