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
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const out: Region[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
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
        if (next < 0 || !mask[next] || seen[next]) continue;
        seen[next] = 1;
        stack[top++] = next;
      }
    }
    region.cx /= region.area;
    region.cy /= region.area;
    out.push(region);
  }
  return out;
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
