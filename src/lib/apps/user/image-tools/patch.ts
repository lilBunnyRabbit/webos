export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Gray {
  data: Float32Array;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Maps the original into the edited copy: an original pixel at (x, y) lands at (x * scale + dx, y * scale + dy). */
export interface Alignment {
  scale: number;
  dx: number;
  dy: number;
}

export interface AlignResult {
  alignment: Alignment;
  match: number;
}

export interface DiffMap {
  data: Uint8Array;
  width: number;
  height: number;
  factor: number;
}

export type ColorMap = number[];

export const IDENTITY_COLORS: ColorMap = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export const RestoreMode = { ADD: "add", ERASE: "erase" } as const;
export type RestoreMode = (typeof RestoreMode)[keyof typeof RestoreMode];

export interface RectOp {
  kind: "rect";
  mode: RestoreMode;
  rect: Rect;
}

export interface BrushOp {
  kind: "brush";
  mode: RestoreMode;
  size: number;
  points: number[];
}

export type RestoreOp = RectOp | BrushOp;

const COARSE_SIDE = 64;
const FINE_SIDE = 1024;
const DIFF_SIDE = 1024;
const MASK_SIDE = 256;
const REGION_SIDE = 256;
const REGION_PAD = 4;
const MIN_LEVEL_SIDE = 8;
const MAX_POSITIONS = 2500;
const SAMPLES_PER_SCORE = 16_000;
const MIN_OVERLAP = 0.25;
/** Slack around the expected offsets: an export may be shifted or padded a little either way. */
const SEARCH_SLACK = 0.15;

export class Pyramid {
  readonly levels: Pixels[];
  private readonly grays: Gray[] = [];

  constructor(base: Pixels) {
    this.levels = [base];
    let last = base;
    while (Math.max(last.width, last.height) > MIN_LEVEL_SIDE * 2 && Math.min(last.width, last.height) >= 2) {
      last = halve(last);
      this.levels.push(last);
    }
  }

  get width(): number {
    return this.levels[0].width;
  }

  get height(): number {
    return this.levels[0].height;
  }

  gray(level: number): Gray {
    return (this.grays[level] ??= to_gray(this.levels[level]));
  }

  level_for(side: number): number {
    let level = 0;
    while (level < this.levels.length - 1 && Math.max(this.levels[level].width, this.levels[level].height) > side) level++;
    return level;
  }

  /** The finest level at least as coarse as `factor` source pixels per sample, so sampling it does not alias. */
  level_at(factor: number): number {
    const level = Math.floor(Math.log2(Math.max(1, factor)) + 1e-9);
    return Math.min(this.levels.length - 1, Math.max(0, level));
  }
}

export function halve({ data, width, height }: Pixels): Pixels {
  const w = Math.floor(width / 2);
  const h = Math.floor(height / 2);
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const top = y * 2 * width * 4;
    const bottom = top + width * 4;
    for (let x = 0; x < w; x++) {
      const a = top + x * 8;
      const b = bottom + x * 8;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[o + c] = (data[a + c] + data[a + 4 + c] + data[b + c] + data[b + 4 + c] + 2) >> 2;
    }
  }
  return { data: out, width: w, height: h };
}

export function to_gray({ data, width, height }: Pixels): Gray {
  const out = new Float32Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = ((0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) * data[p + 3]) / 255;
  }
  return { data: out, width, height };
}

function score(
  edited: Gray,
  edited_factor: number,
  original: Gray,
  original_factor: number,
  a: Alignment,
  stride: number,
  ignore: DiffMap | null
): number {
  const inverse = 1 / (a.scale * original_factor);
  const last_x = original.width - 1;
  const last_y = original.height - 1;
  const start = stride >> 1;
  const columns = Math.ceil((edited.width - start) / stride);
  const rows = Math.ceil((edited.height - start) / stride);
  const o = original.data;
  const e = edited.data;
  let n = 0;
  let sum_a = 0;
  let sum_b = 0;
  let sum_aa = 0;
  let sum_bb = 0;
  let sum_ab = 0;
  let ignored = 0;
  const ignore_unit = ignore ? edited_factor / ignore.factor : 0;
  for (let j = start; j < edited.height; j += stride) {
    const v = ((j + 0.5) * edited_factor - a.dy) * inverse - 0.5;
    if (v < 0 || v > last_y) continue;
    const y0 = v | 0;
    const fy = v - y0;
    const row0 = y0 * original.width;
    const row1 = Math.min(y0 + 1, last_y) * original.width;
    const row_e = j * edited.width;
    const row_ignore = ignore ? Math.min(ignore.height - 1, ((j + 0.5) * ignore_unit) | 0) * ignore.width : 0;
    for (let i = start; i < edited.width; i += stride) {
      if (ignore && ignore.data[row_ignore + Math.min(ignore.width - 1, ((i + 0.5) * ignore_unit) | 0)]) {
        ignored++;
        continue;
      }
      const u = ((i + 0.5) * edited_factor - a.dx) * inverse - 0.5;
      if (u < 0 || u > last_x) continue;
      const x0 = u | 0;
      const fx = u - x0;
      const x1 = Math.min(x0 + 1, last_x);
      const top = o[row0 + x0] + (o[row0 + x1] - o[row0 + x0]) * fx;
      const bottom = o[row1 + x0] + (o[row1 + x1] - o[row1 + x0]) * fx;
      const va = top + (bottom - top) * fy;
      const vb = e[row_e + i];
      n++;
      sum_a += va;
      sum_b += vb;
      sum_aa += va * va;
      sum_bb += vb * vb;
      sum_ab += va * vb;
    }
  }
  const total = columns * rows - ignored;
  if (n < 16 || n < total * MIN_OVERLAP) return Infinity;
  const mean_a = sum_a / n;
  const mean_b = sum_b / n;
  const var_a = sum_aa / n - mean_a * mean_a;
  const var_b = sum_bb / n - mean_b * mean_b;
  const coverage_penalty = 0.02 * (1 - n / total);
  if (var_a < 1e-3 || var_b < 1e-3) return 1 + coverage_penalty;
  return 1 - (sum_ab / n - mean_a * mean_b) / Math.sqrt(var_a * var_b) + coverage_penalty;
}

function stride_for(gray: Gray): number {
  return Math.max(1, Math.floor(Math.sqrt((gray.width * gray.height) / SAMPLES_PER_SCORE)));
}

function score_at(original: Pyramid, edited: Pyramid, level: number, a: Alignment, ignore: DiffMap | null = null): number {
  const factor = 2 ** level;
  const original_level = original.level_at(factor / a.scale);
  const gray = edited.gray(level);
  return score(gray, factor, original.gray(original_level), 2 ** original_level, a, stride_for(gray), ignore);
}

function candidate_scales(original: Pyramid, edited: Pyramid): number[] {
  const by_width = edited.width / original.width;
  const by_height = edited.height / original.height;
  const scales: number[] = [];
  for (const scale of [by_width, by_height, Math.sqrt(by_width * by_height), 1]) {
    if (scale < 0.02 || scale > 50) continue;
    if (scales.some((known) => Math.abs(known / scale - 1) < 0.005)) continue;
    scales.push(scale);
  }
  return scales;
}

function coarse_search(original: Pyramid, edited: Pyramid, level: number, scale: number): { alignment: Alignment; cost: number } {
  const span = (edited_side: number, original_side: number) => {
    const free = edited_side - original_side * scale;
    const slack = edited_side * SEARCH_SLACK;
    return [Math.min(0, free) - slack, Math.max(0, free) + slack];
  };
  const [x_low, x_high] = span(edited.width, original.width);
  const [y_low, y_high] = span(edited.height, original.height);
  let step = 2 ** level;
  const positions = ((x_high - x_low) / step + 1) * ((y_high - y_low) / step + 1);
  if (positions > MAX_POSITIONS) step *= Math.ceil(Math.sqrt(positions / MAX_POSITIONS));

  let best = { alignment: { scale, dx: 0, dy: 0 }, cost: Infinity };
  for (let dy = Math.ceil(y_low / step) * step; dy <= y_high; dy += step) {
    for (let dx = Math.ceil(x_low / step) * step; dx <= x_high; dx += step) {
      const alignment = { scale, dx, dy };
      const cost = score_at(original, edited, level, alignment);
      if (cost < best.cost) best = { alignment, cost };
    }
  }
  return best;
}

/** Rescales about the edited copy's centre, so a scale step does not also drag the picture sideways. */
function rescale(a: Alignment, scale: number, center_x: number, center_y: number): Alignment {
  const ratio = scale / a.scale;
  return { scale, dx: center_x - (center_x - a.dx) * ratio, dy: center_y - (center_y - a.dy) * ratio };
}

function refine(
  original: Pyramid,
  edited: Pyramid,
  start: Alignment,
  coarse: number,
  ignore: DiffMap | null = null
): { alignment: Alignment; cost: number } {
  const fine = edited.level_for(FINE_SIDE);
  const longest = Math.max(edited.width, edited.height);
  const center_x = edited.width / 2;
  const center_y = edited.height / 2;
  const stages: { level: number; step: number }[] = [];
  for (let level = coarse; level >= fine; level--) stages.push({ level, step: 2 ** level });
  for (let step = 2 ** fine / 2; step >= 0.25; step /= 2) stages.push({ level: fine, step });

  let current = start;
  let cost = Infinity;
  for (const { level, step } of stages) {
    cost = score_at(original, edited, level, current, ignore);
    // Moves the far edges by about one step, like the offsets do.
    const delta = (2 * step) / longest;
    for (let round = 0; round < 8; round++) {
      const candidates: Alignment[] = [
        rescale(current, current.scale * (1 - delta), center_x, center_y),
        rescale(current, current.scale * (1 + delta), center_x, center_y),
      ];
      for (const oy of [-step, 0, step]) {
        for (const ox of [-step, 0, step]) {
          if (ox || oy) candidates.push({ scale: current.scale, dx: current.dx + ox, dy: current.dy + oy });
        }
      }
      let best = current;
      for (const candidate of candidates) {
        const next = score_at(original, edited, level, candidate, ignore);
        if (next < cost) {
          cost = next;
          best = candidate;
        }
      }
      if (best === current) break;
      current = best;
    }
  }
  return { alignment: current, cost };
}

export function align(original: Pyramid, edited: Pyramid): AlignResult {
  const coarse = edited.level_for(COARSE_SIDE);
  const starts = candidate_scales(original, edited)
    .map((scale) => coarse_search(original, edited, coarse, scale))
    .filter((entry) => Number.isFinite(entry.cost))
    .sort((a, b) => a.cost - b.cost)
    .slice(0, 2);
  if (!starts.length) return { alignment: { scale: 1, dx: 0, dy: 0 }, match: 0 };

  let best = { alignment: starts[0].alignment, cost: Infinity };
  for (const start of starts) {
    const refined = refine(original, edited, start.alignment, coarse);
    if (refined.cost < best.cost) best = refined;
  }

  // A high-contrast stamp outweighs a smooth picture in the correlation and drags the fit a few pixels; refine
  // again without the cells the first fit says changed.
  const fine = edited.level_for(FINE_SIDE);
  for (let pass = 0; pass < 2; pass++) {
    const ignore = changed_cells(compare(original, edited, best.alignment, true, MASK_SIDE).diff);
    if (!ignore) break;
    best = refine(original, edited, best.alignment, Math.min(coarse, fine + 2), ignore);
  }

  const { scale, dx, dy } = best.alignment;
  return {
    alignment: { scale: round(scale, 4), dx: round(dx, 2), dy: round(dy, 2) },
    match: Number.isFinite(best.cost) ? Math.max(-1, Math.min(1, 1 - best.cost)) : 0,
  };
}

const CHANGED = 40;

/** Cells that clearly changed, grown by one; `null` when nothing or most of the picture changed. */
function changed_cells(diff: DiffMap): DiffMap | null {
  const { data, width, height } = diff;
  const out = new Uint8Array(data.length);
  let count = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[y * width + x] <= CHANGED) continue;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const i = ny * width + nx;
          if (!out[i]) count++;
          out[i] = 1;
        }
      }
    }
  }
  if (!count || count > data.length * 0.5) return null;
  return { ...diff, data: out };
}

function round(value: number, digits: number): number {
  const power = 10 ** digits;
  return Math.round(value * power) / power;
}

export function coverage(a: Alignment, original: { width: number; height: number }, edited: { width: number; height: number }): Rect | null {
  const left = Math.max(0, a.dx);
  const top = Math.max(0, a.dy);
  const right = Math.min(edited.width, a.dx + original.width * a.scale);
  const bottom = Math.min(edited.height, a.dy + original.height * a.scale);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function sample_original(original: Pyramid, a: Alignment, width: number, height: number, factor: number): Float32Array {
  const level = original.level_at(factor / a.scale);
  const { data, width: ow, height: oh } = original.levels[level];
  const inverse = 1 / (a.scale * 2 ** level);
  const out = new Float32Array(width * height * 4).fill(Number.NaN);
  for (let j = 0; j < height; j++) {
    const v = ((j + 0.5) * factor - a.dy) * inverse - 0.5;
    if (v < -0.5 || v > oh - 0.5) continue;
    const vc = Math.min(Math.max(v, 0), oh - 1);
    const y0 = vc | 0;
    const fy = vc - y0;
    const y1 = Math.min(y0 + 1, oh - 1);
    for (let i = 0; i < width; i++) {
      const u = ((i + 0.5) * factor - a.dx) * inverse - 0.5;
      if (u < -0.5 || u > ow - 0.5) continue;
      const uc = Math.min(Math.max(u, 0), ow - 1);
      const x0 = uc | 0;
      const fx = uc - x0;
      const x1 = Math.min(x0 + 1, ow - 1);
      const p00 = (y0 * ow + x0) * 4;
      const p01 = (y0 * ow + x1) * 4;
      const p10 = (y1 * ow + x0) * 4;
      const p11 = (y1 * ow + x1) * 4;
      const o = (j * width + i) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[p00 + c] + (data[p01 + c] - data[p00 + c]) * fx;
        const bottom = data[p10 + c] + (data[p11 + c] - data[p10 + c]) * fx;
        out[o + c] = top + (bottom - top) * fy;
      }
    }
  }
  return out;
}

function solve4(matrix: number[][], rhs: number[]): number[] | null {
  const m = matrix.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 4; col++) {
    let pivot = col;
    for (let row = col + 1; row < 4; row++) if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let row = 0; row < 4; row++) {
      if (row === col) continue;
      const f = m[row][col] / m[col][col];
      for (let k = col; k < 5; k++) m[row][k] -= f * m[col][k];
    }
  }
  return m.map((row, i) => row[4] / row[i]);
}

/**
 * Least-squares colour transform from `source` to `target` RGB (4 floats per pixel, NaN = skip). A second pass drops
 * the pixels the first fit explains worst, so a stamped mark doesn't skew the global colour change.
 */
export function fit_colors(source: Float32Array, target: Uint8ClampedArray | Float32Array, stride = 1): ColorMap {
  let colors = IDENTITY_COLORS;
  for (let pass = 0; pass < 2; pass++) {
    const ata = [0, 1, 2, 3].map(() => [0, 0, 0, 0]);
    const atb = [0, 1, 2].map(() => [0, 0, 0, 0]);
    let used = 0;
    for (let p = 0; p < source.length; p += 4 * stride) {
      const r = source[p];
      if (Number.isNaN(r)) continue;
      const x = [r, source[p + 1], source[p + 2], 255];
      if (pass === 1 && residual(colors, x, target, p) > 40) continue;
      used++;
      for (let i = 0; i < 4; i++) {
        for (let k = 0; k < 4; k++) ata[i][k] += x[i] * x[k];
        for (let c = 0; c < 3; c++) atb[c][i] += x[i] * target[p + c];
      }
    }
    if (used < 16) return colors;
    const ridge = used * 1e-2;
    for (let i = 0; i < 3; i++) ata[i][i] += ridge;
    const next: number[] = [];
    for (let c = 0; c < 3; c++) {
      const prior = [0, 1, 2, 3].map((i) => (i === c ? ridge : 0));
      const row = solve4(
        ata,
        atb[c].map((value, i) => value + prior[i])
      );
      if (!row) return colors;
      next.push(row[0], row[1], row[2], row[3] * 255);
    }
    colors = next;
  }
  return colors;
}

function residual(colors: ColorMap, x: number[], target: ArrayLike<number>, p: number): number {
  let worst = 0;
  for (let c = 0; c < 3; c++) {
    const m = c * 4;
    const mapped = colors[m] * x[0] + colors[m + 1] * x[1] + colors[m + 2] * x[2] + colors[m + 3];
    worst = Math.max(worst, Math.abs(mapped - target[p + c]));
  }
  return worst;
}

export interface Comparison {
  diff: DiffMap;
  colors: ColorMap;
}

export function compare(original: Pyramid, edited: Pyramid, a: Alignment, match_colors: boolean, side = DIFF_SIDE): Comparison {
  const level = edited.level_for(side);
  const factor = 2 ** level;
  const { data, width, height } = edited.levels[level];
  const sampled = sample_original(original, a, width, height, factor);
  const stride = Math.max(1, Math.floor((width * height) / 60_000));
  const colors = match_colors ? fit_colors(sampled, data, stride) : IDENTITY_COLORS;
  const out = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    const r = sampled[p];
    if (Number.isNaN(r)) continue;
    const g = sampled[p + 1];
    const b = sampled[p + 2];
    let worst = Math.abs(sampled[p + 3] - data[p + 3]);
    for (let c = 0; c < 3; c++) {
      const m = c * 4;
      const mapped = Math.min(255, Math.max(0, colors[m] * r + colors[m + 1] * g + colors[m + 2] * b + colors[m + 3]));
      worst = Math.max(worst, Math.abs(mapped - data[p + c]));
    }
    out[i] = Math.min(255, Math.round(worst));
  }
  return { diff: { data: out, width, height, factor }, colors };
}

export function apply_colors(pixels: Pixels, colors: ColorMap): void {
  const { data } = pixels;
  for (let p = 0; p < data.length; p += 4) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    data[p] = colors[0] * r + colors[1] * g + colors[2] * b + colors[3];
    data[p + 1] = colors[4] * r + colors[5] * g + colors[6] * b + colors[7];
    data[p + 2] = colors[8] * r + colors[9] * g + colors[10] * b + colors[11];
  }
}

export function is_identity(colors: ColorMap): boolean {
  return colors.every((value, i) => Math.abs(value - IDENTITY_COLORS[i]) < 1e-3);
}

/**
 * Groups cells changed by more than `tolerance` (0-255) into boxes, in edited pixels, smallest first. Cells are pooled
 * onto a coarse grid and dilated once, so the letters of one stamped word come out as one box.
 */
export function find_regions(diff: DiffMap, tolerance: number): Rect[] {
  const { data, width, height, factor } = diff;
  const block = Math.max(1, Math.ceil(Math.max(width, height) / REGION_SIDE));
  const columns = Math.ceil(width / block);
  const rows = Math.ceil(height / block);
  const needed = block > 1 ? 2 : 1;
  const counts = new Uint16Array(columns * rows);
  for (let y = 0; y < height; y++) {
    const row = ((y / block) | 0) * columns;
    for (let x = 0; x < width; x++) if (data[y * width + x] > tolerance) counts[row + ((x / block) | 0)]++;
  }
  const on = new Uint8Array(columns * rows);
  for (let i = 0; i < on.length; i++) on[i] = counts[i] >= needed ? 1 : 0;

  const grown = new Uint8Array(on.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      if (!on[y * columns + x]) continue;
      for (let ny = Math.max(0, y - 1); ny <= Math.min(rows - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(columns - 1, x + 1); nx++) grown[ny * columns + nx] = 1;
      }
    }
  }

  const label = new Int32Array(on.length).fill(-1);
  const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
  const queue = new Int32Array(on.length);
  for (let start = 0; start < on.length; start++) {
    if (!grown[start] || label[start] >= 0) continue;
    const id = boxes.length;
    const box = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    label[start] = id;
    while (head < tail) {
      const cell = queue[head++];
      const x = cell % columns;
      const y = (cell / columns) | 0;
      if (on[cell]) {
        box.left = Math.min(box.left, x);
        box.top = Math.min(box.top, y);
        box.right = Math.max(box.right, x);
        box.bottom = Math.max(box.bottom, y);
      }
      for (let ny = Math.max(0, y - 1); ny <= Math.min(rows - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(columns - 1, x + 1); nx++) {
          const next = ny * columns + nx;
          if (grown[next] && label[next] < 0) {
            label[next] = id;
            queue[tail++] = next;
          }
        }
      }
    }
    if (Number.isFinite(box.left)) boxes.push(box);
  }

  const merged = merge_boxes(boxes);
  const unit = block * factor;
  const edited_width = width * factor;
  const edited_height = height * factor;
  // Marks have soft, antialiased edges and the feather fades the restore at its border, so boxes reach past the cells.
  const pad = Math.max(REGION_PAD, unit);
  return merged
    .map(({ left, top, right, bottom }) => {
      const x = Math.max(0, left * unit - pad);
      const y = Math.max(0, top * unit - pad);
      return {
        x,
        y,
        width: Math.min(edited_width, (right + 1) * unit + pad) - x,
        height: Math.min(edited_height, (bottom + 1) * unit + pad) - y,
      };
    })
    .sort((a, b) => a.width * a.height - b.width * b.height);
}

function merge_boxes<T extends { left: number; top: number; right: number; bottom: number }>(boxes: T[]): T[] {
  const list = boxes.map((box) => ({ ...box }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < list.length; i++) {
      for (let k = i + 1; k < list.length; k++) {
        const a = list[i];
        const b = list[k];
        if (a.left > b.right + 1 || b.left > a.right + 1 || a.top > b.bottom + 1 || b.top > a.bottom + 1) continue;
        a.left = Math.min(a.left, b.left);
        a.top = Math.min(a.top, b.top);
        a.right = Math.max(a.right, b.right);
        a.bottom = Math.max(a.bottom, b.bottom);
        list.splice(k, 1);
        changed = true;
        break outer;
      }
    }
  }
  return list;
}

export function same_rect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

export function is_restored(ops: RestoreOp[], rect: Rect): boolean {
  return ops.some((op) => op.kind === "rect" && op.mode === RestoreMode.ADD && same_rect(op.rect, rect));
}

export function toggle_rect(ops: RestoreOp[], rect: Rect): RestoreOp[] {
  if (is_restored(ops, rect)) return ops.filter((op) => !(op.kind === "rect" && op.mode === RestoreMode.ADD && same_rect(op.rect, rect)));
  return [...ops, { kind: "rect", mode: RestoreMode.ADD, rect }];
}

/** The smallest box under a point, so a small mark inside a large edit stays clickable. */
export function rect_at<T extends Rect>(rects: T[], x: number, y: number): T | undefined {
  let best: T | undefined;
  for (const rect of rects) {
    if (contains(rect, x, y) && (!best || rect.width * rect.height < best.width * best.height)) best = rect;
  }
  return best;
}

export function drag_rect(x0: number, y0: number, x1: number, y1: number, width: number, height: number): Rect {
  const left = Math.max(0, Math.floor(Math.min(x0, x1)));
  const top = Math.max(0, Math.floor(Math.min(y0, y1)));
  const right = Math.min(width, Math.ceil(Math.max(x0, x1)));
  const bottom = Math.min(height, Math.ceil(Math.max(y0, y1)));
  return { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export function ops_bounds(ops: RestoreOp[]): Rect | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const op of ops) {
    if (op.mode !== RestoreMode.ADD) continue;
    if (op.kind === "rect") {
      left = Math.min(left, op.rect.x);
      top = Math.min(top, op.rect.y);
      right = Math.max(right, op.rect.x + op.rect.width);
      bottom = Math.max(bottom, op.rect.y + op.rect.height);
      continue;
    }
    const half = op.size / 2;
    for (let i = 0; i < op.points.length; i += 2) {
      left = Math.min(left, op.points[i] - half);
      top = Math.min(top, op.points[i + 1] - half);
      right = Math.max(right, op.points[i] + half);
      bottom = Math.max(bottom, op.points[i + 1] + half);
    }
  }
  if (!Number.isFinite(left)) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function draw_ops(context: Context2D, ops: RestoreOp[], scale: number): void {
  context.save();
  context.scale(scale, scale);
  for (const op of ops) {
    context.globalCompositeOperation = op.mode === RestoreMode.ERASE ? "destination-out" : "source-over";
    if (op.kind === "rect") {
      context.fillRect(op.rect.x, op.rect.y, op.rect.width, op.rect.height);
      continue;
    }
    const { points, size } = op;
    if (points.length === 2) {
      context.beginPath();
      context.arc(points[0], points[1], size / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.strokeStyle = context.fillStyle;
    context.lineWidth = size;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
    context.stroke();
  }
  context.restore();
}

export interface ComposeOptions {
  original: ImageBitmap | OffscreenCanvas;
  edited: ImageBitmap | OffscreenCanvas;
  alignment: Alignment;
  ops: RestoreOp[];
  colors: ColorMap;
  feather: number;
  scale?: number;
}

export function compose({ original, edited, alignment, ops, colors, feather, scale = 1 }: ComposeOptions): OffscreenCanvas {
  const width = Math.max(1, Math.round(edited.width * scale));
  const height = Math.max(1, Math.round(edited.height * scale));
  const out = new OffscreenCanvas(width, height);
  const context = out.getContext("2d")!;
  context.drawImage(edited, 0, 0, width, height);

  const covered = coverage(alignment, original, edited);
  const bounds = ops_bounds(ops);
  if (!covered || !bounds) return out;

  const mask = new OffscreenCanvas(width, height);
  const mask_context = mask.getContext("2d")!;
  mask_context.fillStyle = "#000";
  draw_ops(mask_context, ops, scale);
  mask_context.globalCompositeOperation = "destination-in";
  mask_context.fillRect(covered.x * scale, covered.y * scale, covered.width * scale, covered.height * scale);

  const patch = new OffscreenCanvas(width, height);
  const patch_context = patch.getContext("2d", { willReadFrequently: true })!;
  patch_context.imageSmoothingQuality = "high";
  patch_context.setTransform(alignment.scale * scale, 0, 0, alignment.scale * scale, alignment.dx * scale, alignment.dy * scale);
  patch_context.drawImage(original, 0, 0);
  patch_context.setTransform(1, 0, 0, 1, 0, 0);

  const blur = feather * scale;
  const margin = Math.ceil(blur * 2) + 2;
  const left = Math.max(0, Math.floor(bounds.x * scale) - margin);
  const top = Math.max(0, Math.floor(bounds.y * scale) - margin);
  const right = Math.min(width, Math.ceil((bounds.x + bounds.width) * scale) + margin);
  const bottom = Math.min(height, Math.ceil((bounds.y + bounds.height) * scale) + margin);
  if (right <= left || bottom <= top) return out;

  if (!is_identity(colors)) {
    const pixels = patch_context.getImageData(left, top, right - left, bottom - top);
    apply_colors(pixels, colors);
    patch_context.putImageData(pixels, left, top);
  }

  patch_context.globalCompositeOperation = "destination-in";
  if (blur > 0) patch_context.filter = `blur(${blur}px)`;
  patch_context.drawImage(mask, 0, 0);
  patch_context.filter = "none";
  context.drawImage(patch, left, top, right - left, bottom - top, left, top, right - left, bottom - top);
  return out;
}

export function draw_heatmap(diff: DiffMap, color: string): OffscreenCanvas {
  const canvas = new OffscreenCanvas(diff.width, diff.height);
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(diff.width, diff.height);
  for (let i = 0; i < diff.data.length; i++) image.data[i * 4 + 3] = Math.min(255, diff.data[i] * 4);
  context.putImageData(image, 0, 0);
  context.globalCompositeOperation = "source-in";
  context.fillStyle = color;
  context.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

export function draw_aligned(original: ImageBitmap | OffscreenCanvas, edited: { width: number; height: number }, a: Alignment, scale: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(edited.width * scale)), Math.max(1, Math.round(edited.height * scale)));
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.setTransform(a.scale * scale, 0, 0, a.scale * scale, a.dx * scale, a.dy * scale);
  context.drawImage(original, 0, 0);
  return canvas;
}
