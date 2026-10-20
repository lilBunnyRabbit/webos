import type { Position } from "$lib/core/utils/type";
import { gray, type Gray } from "./ncc";

export const BLOB = {
  BORDER: 2,
  SIGMA: 4,
  /** Sigma floor in levels, so a clean sky doesn't turn compression noise into foreground. */
  FLOOR: 3,
  /** Luma noise of the edge's background above this (robust sigma, levels) is texture, not sky. */
  BUSY: 9,
  /** Share of the edge that has to fit the background plane; under it the window is mostly something else. */
  SKY: 0.5,
  /** Ring around a blob, against its size, that has to be nearly all background, so a leaf on a tree isn't a bird. */
  MARGIN: 0.5,
  ISOLATION: 0.1,
  /** Plausible component area against the subject's: wings spread and fold, so it's wide. */
  MIN_AREA: 0.3,
  MAX_AREA: 3.5,
  ACCEPT: 0.45,
  LEARN: 0.65,
} as const;

export interface Planes {
  luma: Gray;
  chroma: Gray;
}

export interface Fit {
  a: number;
  bx: number;
  by: number;
  sigma: number;
  share: number;
}

export interface Background {
  luma: Fit;
  chroma: Fit;
  busy: boolean;
}

export interface Component {
  area: number;
  cx: number;
  cy: number;
  left: number;
  top: number;
  right: number;
  bottom: number;
  contrast: number;
}

export interface Blob extends Component {
  conf: number;
}

export interface Subject {
  area: number;
  dx: number;
  dy: number;
}

export function to_planes(rgba: ArrayLike<number>, width: number, height: number): Planes {
  const luma = gray(width, height);
  const chroma = gray(width, height);
  for (let i = 0, p = 0; i < luma.data.length; i++, p += 4) {
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    luma.data[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    chroma.data[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  return { luma, chroma };
}

function border_indices(width: number, height: number): Int32Array {
  const ring = Math.min(BLOB.BORDER, width >> 1, height >> 1);
  const out: number[] = [];
  for (let y = 0; y < height; y++) {
    const edge_row = y < ring || y >= height - ring;
    for (let x = 0; x < width; x++) if (edge_row || x < ring || x >= width - ring) out.push(y * width + x);
  }
  return Int32Array.from(out);
}

function median(values: Float32Array): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort();
  const mid = sorted.length >> 1;
  return sorted.length & 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function residual(image: Gray, fit: Fit, at: number): number {
  const x = at % image.width;
  return image.data[at] - (fit.a + fit.bx * x + fit.by * ((at - x) / image.width));
}

function spread(image: Gray, fit: Fit, ring: Int32Array): Fit {
  const residuals = new Float32Array(ring.length);
  ring.forEach((at, i) => (residuals[i] = residual(image, fit, at)));
  const shift = median(residuals);
  for (let i = 0; i < residuals.length; i++) residuals[i] = Math.abs(residuals[i] - shift);
  return { ...fit, a: fit.a + shift, sigma: 1.4826 * median(residuals) };
}

function least_squares(image: Gray, ring: Int32Array, previous: Fit): Fit {
  const width = image.width;
  let n = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sv = 0;
  let sxv = 0;
  let syv = 0;
  for (const at of ring) {
    const x = at % width;
    const y = (at - x) / width;
    const v = image.data[at];
    n++;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sv += v;
    sxv += x * v;
    syv += y * v;
  }
  const det = n * (sxx * syy - sxy * sxy) - sx * (sx * syy - sxy * sy) + sy * (sx * sxy - sxx * sy);
  if (Math.abs(det) < 1e-9) return previous;
  return {
    ...previous,
    a: (sv * (sxx * syy - sxy * sxy) - sx * (sxv * syy - sxy * syv) + sy * (sxv * sxy - sxx * syv)) / det,
    bx: (n * (sxv * syy - sxy * syv) - sv * (sx * syy - sxy * sy) + sy * (sx * syv - sxv * sy)) / det,
    by: (n * (sxx * syv - sxv * sxy) - sx * (sx * syv - sxv * sy) + sv * (sx * sxy - sxx * sy)) / det,
  };
}

// The edge's median first, so when trees cover part of the edge the sky (the majority) sets the level; then a plane
// through the pixels near it, because a sky window is a gradient top to bottom.
function fit_plane(image: Gray, ring: Int32Array): Fit {
  let fit = spread(image, { a: 0, bx: 0, by: 0, sigma: 0, share: 1 }, ring);
  for (let pass = 0; pass < 4; pass++) {
    const limit = 2.5 * Math.max(fit.sigma, BLOB.FLOOR);
    const keep = ring.filter((at) => Math.abs(residual(image, fit, at)) <= limit);
    if (keep.length < 3) break;
    fit = spread(image, least_squares(image, keep, fit), keep);
    fit.share = keep.length / ring.length;
  }
  return fit;
}

export function estimate_background(planes: Planes): Background {
  const ring = border_indices(planes.luma.width, planes.luma.height);
  const luma = fit_plane(planes.luma, ring);
  const chroma = fit_plane(planes.chroma, ring);
  return { luma, chroma, busy: luma.sigma > BLOB.BUSY || Math.min(luma.share, chroma.share) < BLOB.SKY };
}

export function busy_edge(luma: Gray): boolean {
  const fit = fit_plane(luma, border_indices(luma.width, luma.height));
  return fit.sigma > BLOB.BUSY || fit.share < BLOB.SKY;
}

export function segment(planes: Planes, background: Background): Float32Array {
  const { luma, chroma } = background;
  const luma_sigma = Math.max(luma.sigma, BLOB.FLOOR);
  const chroma_sigma = Math.max(chroma.sigma, BLOB.FLOOR);
  const out = new Float32Array(planes.luma.data.length);
  for (let at = 0; at < out.length; at++) {
    const d = Math.max(
      Math.abs(residual(planes.luma, luma, at)) / luma_sigma,
      Math.abs(residual(planes.chroma, chroma, at)) / chroma_sigma
    );
    if (d > BLOB.SIGMA) out[at] = d;
  }
  return out;
}

export function components(mask: Float32Array, width: number, height: number): Component[] {
  const label = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const out: Component[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] === 0 || label[start]) continue;
    label[start] = 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let strength = 0;
    let left = width;
    let top = height;
    let right = -1;
    let bottom = -1;
    while (head < tail) {
      const at = queue[head++];
      const x = at % width;
      const y = (at - x) / width;
      area++;
      sx += x;
      sy += y;
      strength += mask[at];
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (mask[next] === 0 || label[next]) continue;
          label[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    out.push({
      area,
      cx: sx / area + 0.5,
      cy: sy / area + 0.5,
      left,
      top,
      right: right + 1,
      bottom: bottom + 1,
      contrast: strength / area,
    });
  }
  return out;
}

export function surroundings(mask: Float32Array, width: number, height: number, component: Component): number {
  const margin = Math.max(
    3,
    Math.round(Math.max(component.right - component.left, component.bottom - component.top) * BLOB.MARGIN)
  );
  const x0 = Math.max(0, component.left - margin);
  const x1 = Math.min(width, component.right + margin);
  const y0 = Math.max(0, component.top - margin);
  const y1 = Math.min(height, component.bottom + margin);
  let total = 0;
  let foreground = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      if (x >= component.left && x < component.right && y >= component.top && y < component.bottom) continue;
      total++;
      if (mask[y * width + x] > 0) foreground++;
    }
  return total ? foreground / total : 1;
}

export function blob_conf(component: Component, expected_area: number): number {
  const contrast = Math.min(1, component.contrast / (BLOB.SIGMA * 3));
  const size = Math.exp(-Math.abs(Math.log(component.area / Math.max(1, expected_area))));
  return Math.sqrt(contrast * size);
}

export function pick_component(
  mask: Float32Array,
  width: number,
  height: number,
  predicted: Position,
  expected_area: number
): Blob | null {
  let best: Blob | null = null;
  let best_distance = Infinity;
  for (const component of components(mask, width, height)) {
    const ratio = component.area / Math.max(1, expected_area);
    if (ratio < BLOB.MIN_AREA || ratio > BLOB.MAX_AREA) continue;
    const away = Math.hypot(component.cx - predicted.x, component.cy - predicted.y);
    if (away >= best_distance || surroundings(mask, width, height, component) > BLOB.ISOLATION) continue;
    best_distance = away;
    best = { ...component, conf: blob_conf(component, expected_area) };
  }
  return best;
}

export function find_blob(planes: Planes, predicted: Position, expected_area: number): Blob | null {
  const background = estimate_background(planes);
  if (background.busy) return null;
  const { width, height } = planes.luma;
  return pick_component(segment(planes, background), width, height, predicted, expected_area);
}

export function measure_subject(planes: Planes, centre: Position, width: number, height: number): Subject | null {
  const background = estimate_background(planes);
  if (background.busy) return null;
  const inside = components(segment(planes, background), planes.luma.width, planes.luma.height).filter(
    (component) =>
      Math.abs(component.cx - centre.x) <= width / 2 &&
      Math.abs(component.cy - centre.y) <= height / 2 &&
      component.area >= 4
  );
  const area = inside.reduce((sum, component) => sum + component.area, 0);
  if (!area || area > width * height) return null;
  const cx = inside.reduce((sum, component) => sum + component.cx * component.area, 0) / area;
  const cy = inside.reduce((sum, component) => sum + component.cy * component.area, 0) / area;
  return { area, dx: cx - centre.x, dy: cy - centre.y };
}
