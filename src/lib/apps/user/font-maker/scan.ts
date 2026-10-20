import type { Vec } from "./outline";
import type { TemplateBox } from "./template";

export interface Gray {
  width: number;
  height: number;
  data: Uint8Array;
}

export type Quad = [Vec, Vec, Vec, Vec];
export type Matrix = number[];

export function to_gray(rgba: ArrayLike<number>, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let index = 0; index < data.length; index++) {
    const at = index * 4;
    data[index] = Math.round(rgba[at] * 0.299 + rgba[at + 1] * 0.587 + rgba[at + 2] * 0.114);
  }
  return { width, height, data };
}

function dark_mask(gray: Gray): Uint8Array {
  const { width, height, data } = gray;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x];
      integral[(y + 1) * (width + 1) + x + 1] = integral[y * (width + 1) + x + 1] + row;
    }
  }
  const radius = Math.max(4, Math.round(Math.max(width, height) / 16));
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1] - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      if (data[y * width + x] < mean * 0.72) mask[y * width + x] = 1;
    }
  }
  return mask;
}

interface Blob {
  area: number;
  x_min: number;
  y_min: number;
  x_max: number;
  y_max: number;
  cx: number;
  cy: number;
  edge: boolean;
}

function blobs(mask: Uint8Array, width: number, height: number): Blob[] {
  const seen = new Uint8Array(mask.length);
  const stack = new Int32Array(mask.length);
  const out: Blob[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    const blob: Blob = { area: 0, x_min: width, y_min: height, x_max: 0, y_max: 0, cx: 0, cy: 0, edge: false };
    while (top) {
      const at = stack[--top];
      const x = at % width;
      const y = (at - x) / width;
      blob.area++;
      blob.cx += x;
      blob.cy += y;
      if (x < blob.x_min) blob.x_min = x;
      if (x > blob.x_max) blob.x_max = x;
      if (y < blob.y_min) blob.y_min = y;
      if (y > blob.y_max) blob.y_max = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) blob.edge = true;
      const neighbours = [x > 0 ? at - 1 : -1, x < width - 1 ? at + 1 : -1, y > 0 ? at - width : -1, y < height - 1 ? at + width : -1];
      for (const next of neighbours) {
        if (next < 0 || !mask[next] || seen[next]) continue;
        seen[next] = 1;
        stack[top++] = next;
      }
    }
    blob.cx /= blob.area;
    blob.cy /= blob.area;
    out.push(blob);
  }
  return out;
}

function holed(mask: Uint8Array, width: number, blob: Blob): boolean {
  const radius = Math.max(1, Math.round(Math.min(blob.x_max - blob.x_min, blob.y_max - blob.y_min) / 12));
  let light = 0;
  let total = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      total++;
      if (!mask[Math.round(blob.cy + dy) * width + Math.round(blob.cx + dx)]) light++;
    }
  }
  return light > total / 2;
}

export function find_marks(gray: Gray): Quad | null {
  const { width, height } = gray;
  const mask = dark_mask(gray);
  const side = Math.min(width, height);
  const candidates = blobs(mask, width, height).filter((blob) => {
    const w = blob.x_max - blob.x_min + 1;
    const h = blob.y_max - blob.y_min + 1;
    const aspect = w / h;
    return !blob.edge && blob.area >= (side * 0.012) ** 2 && blob.area <= (side * 0.15) ** 2 && aspect > 0.4 && aspect < 2.5 && blob.area / (w * h) >= 0.4;
  });
  const quadrants: (Blob | null)[] = [null, null, null, null];
  for (const blob of candidates) {
    const right = blob.cx >= width / 2;
    const bottom = blob.cy >= height / 2;
    const index = bottom ? (right ? 2 : 3) : right ? 1 : 0;
    if (!quadrants[index] || quadrants[index]!.area < blob.area) quadrants[index] = blob;
  }
  if (quadrants.some((blob) => !blob)) return null;
  const found = quadrants as Blob[];
  const areas = found.map((blob) => blob.area);
  if (Math.max(...areas) > Math.min(...areas) * 5) return null;
  const holes = found.map((blob) => holed(mask, width, blob));
  const first = holes.filter(Boolean).length === 1 ? holes.indexOf(true) : 0;
  return [0, 1, 2, 3].map((step) => {
    const blob = found[(first + step) % 4];
    return { x: blob.cx + 0.5, y: blob.cy + 0.5 };
  }) as Quad;
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

export function project(matrix: Matrix, point: Vec): Vec {
  const w = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / w,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / w,
  };
}

function sample(gray: Gray, x: number, y: number): number {
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

export function crop_box(gray: Gray, page_to_image: Matrix, box: TemplateBox, width: number, height: number): Gray {
  const data = new Uint8Array(width * height);
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const point = project(page_to_image, { x: box.x + ((i + 0.5) / width) * box.width, y: box.y + ((j + 0.5) / height) * box.height });
      data[j * width + i] = sample(gray, point.x, point.y);
    }
  }
  const sorted = Uint8Array.from(data).sort();
  const white = Math.max(1, sorted[Math.floor(sorted.length * 0.9)]);
  for (let index = 0; index < data.length; index++) data[index] = Math.min(255, Math.round((data[index] * 255) / white));
  return { width, height, data };
}

export function has_ink(gray: Gray): boolean {
  const { width, height, data } = gray;
  const inset_x = Math.ceil(width * 0.06);
  const inset_y = Math.ceil(height * 0.06);
  let ink = 0;
  let total = 0;
  for (let y = inset_y; y < height - inset_y; y++) {
    for (let x = inset_x; x < width - inset_x; x++) {
      total++;
      if (data[y * width + x] < 128) ink++;
    }
  }
  return total > 0 && ink / total > 0.003;
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
