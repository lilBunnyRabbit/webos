import { z } from "zod";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Range {
  start: number;
  end: number;
}

export const GridMode = { GRID: "grid", SIZE: "size" } as const;
export type GridMode = (typeof GridMode)[keyof typeof GridMode];

export interface Sides {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type PaddingSide = keyof Sides;

export interface SpriteSettings {
  mode: GridMode;
  /** Used in `grid` mode. */
  columns: number;
  rows: number;
  /** Used in `size` mode. */
  frame_width: number;
  frame_height: number;
  padding: Sides;
  spacing: { x: number; y: number };
}

export interface RangeOverride {
  start?: number;
  end?: number;
}

export interface SpriteOverrides {
  columns: Record<number, RangeOverride>;
  rows: Record<number, RangeOverride>;
  frames: Record<number, Rect>;
}

export interface SpriteGrid {
  columns: Range[];
  rows: Range[];
  /** Row-major, index = r * columns.length + c. */
  frames: Rect[];
  /** Image minus padding. */
  bounds: Rect;
}

export type LineAxis = "column" | "row";
export type LineEdge = keyof RangeOverride;

export const DEFAULT_SETTINGS: SpriteSettings = {
  mode: GridMode.GRID,
  columns: 8,
  rows: 8,
  frame_width: 128,
  frame_height: 128,
  padding: { top: 0, right: 0, bottom: 0, left: 0 },
  spacing: { x: 0, y: 0 },
};

export const EMPTY_OVERRIDES: SpriteOverrides = { columns: {}, rows: {}, frames: {} };

function num(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

function distribute(start: number, total: number, count: number, spacing: number): Range[] {
  if (count <= 0) return [];
  const size = (total - spacing * (count - 1)) / count;
  return Array.from({ length: count }, (_, i) => {
    const s = start + i * (size + spacing);
    return { start: s, end: s + size };
  });
}

function tile(start: number, total: number, size: number, spacing: number): Range[] {
  if (size <= 0) return [];
  const count = Math.max(0, Math.floor((total + spacing) / (size + spacing)));
  return Array.from({ length: count }, (_, i) => {
    const s = start + i * (size + spacing);
    return { start: s, end: s + size };
  });
}

export function compute_base_grid(width: number, height: number, settings: SpriteSettings) {
  const pad = {
    top: num(settings.padding.top),
    right: num(settings.padding.right),
    bottom: num(settings.padding.bottom),
    left: num(settings.padding.left),
  };
  const spacing = { x: Math.max(0, num(settings.spacing.x)), y: Math.max(0, num(settings.spacing.y)) };

  const bounds: Rect = {
    x: pad.left,
    y: pad.top,
    w: Math.max(0, width - pad.left - pad.right),
    h: Math.max(0, height - pad.top - pad.bottom),
  };

  const grid = settings.mode === GridMode.GRID;
  const columns = grid
    ? distribute(bounds.x, bounds.w, Math.max(0, Math.floor(num(settings.columns))), spacing.x)
    : tile(bounds.x, bounds.w, num(settings.frame_width), spacing.x);
  const rows = grid
    ? distribute(bounds.y, bounds.h, Math.max(0, Math.floor(num(settings.rows))), spacing.y)
    : tile(bounds.y, bounds.h, num(settings.frame_height), spacing.y);

  return { columns, rows, bounds };
}

export function compute_grid(
  width: number,
  height: number,
  settings: SpriteSettings,
  overrides: SpriteOverrides = EMPTY_OVERRIDES
): SpriteGrid {
  const base = compute_base_grid(width, height, settings);
  const columns = base.columns.map((range, i) => ({ ...range, ...overrides.columns[i] }));
  const rows = base.rows.map((range, i) => ({ ...range, ...overrides.rows[i] }));

  const frames: Rect[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < columns.length; c++) {
      const override = overrides.frames[r * columns.length + c];
      frames.push(
        override
          ? { ...override }
          : {
              x: columns[c].start,
              y: rows[r].start,
              w: columns[c].end - columns[c].start,
              h: rows[r].end - rows[r].start,
            }
      );
    }
  }

  return { columns, rows, frames, bounds: base.bounds };
}

export function count_overrides(overrides: SpriteOverrides): number {
  return (
    Object.keys(overrides.frames).length + Object.keys(overrides.columns).length + Object.keys(overrides.rows).length
  );
}

export function round_rect(rect: Rect): Rect {
  const x = Math.round(rect.x);
  const y = Math.round(rect.y);
  return { x, y, w: Math.round(rect.x + rect.w) - x, h: Math.round(rect.y + rect.h) - y };
}

export function clamp_rect(rect: Rect, width: number, height: number): Rect {
  const x = Math.min(Math.max(0, rect.x), width);
  const y = Math.min(Math.max(0, rect.y), height);
  return { x, y, w: Math.min(Math.max(1, rect.w), width - x), h: Math.min(Math.max(1, rect.h), height - y) };
}

/** Largest frame among `indices` (all frames when omitted): the cell every frame fits in. */
export function frame_size(frames: Rect[], indices?: number[]): { w: number; h: number } {
  let w = 0;
  let h = 0;
  const list = indices ? indices.map((i) => frames[i]).filter(Boolean) : frames;
  for (const frame of list) {
    w = Math.max(w, Math.ceil(frame.w));
    h = Math.max(h, Math.ceil(frame.h));
  }
  return { w, h };
}

export type SequenceOrder = "row" | "column";

export function default_sequence(columns: number, rows: number, order: SequenceOrder = "row"): number[] {
  if (order === "row") return Array.from({ length: columns * rows }, (_, i) => i);
  const out: number[] = [];
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) out.push(r * columns + c);
  }
  return out;
}

/** `"0-7, 9, 15-8"` → frame indices. Ranges are inclusive and may run backwards. `null` when malformed. */
export function parse_sequence(text: string, max: number): number[] | null {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const out: number[] = [];
  for (const raw of trimmed.split(/[\s,;]+/)) {
    if (!raw) continue;
    const match = raw.match(/^(\d+)(?:\s*[-:]\s*(\d+))?$/);
    if (!match) return null;
    const a = Number(match[1]);
    const b = match[2] !== undefined ? Number(match[2]) : a;
    if (a >= max || b >= max) return null;
    if (a <= b) for (let i = a; i <= b; i++) out.push(i);
    else for (let i = a; i >= b; i--) out.push(i);
  }
  return out;
}

/** `[0,1,2,3,7,6,9]` → `"0-3, 7-6, 9"`. */
export function format_sequence(indices: number[]): string {
  if (!indices.length) return "";
  const parts: string[] = [];
  let start = indices[0];
  let prev = indices[0];
  let dir = 0;

  const flush = () => parts.push(start === prev ? `${start}` : `${start}-${prev}`);

  for (let i = 1; i < indices.length; i++) {
    const current = indices[i];
    const d = current - prev;
    if ((d === 1 || d === -1) && (dir === 0 || dir === d)) {
      dir = d;
      prev = current;
      continue;
    }
    flush();
    start = current;
    prev = current;
    dir = 0;
  }
  flush();
  return parts.join(", ");
}

export interface DetectOptions {
  /** 0-255. Pixels with alpha at or below this count as empty. */
  alpha_threshold: number;
  /** Gaps narrower than this (px) are noise inside a frame, not separators. */
  min_gap: number;
  /** Segments narrower than this (px) are dropped as noise. */
  min_segment: number;
}

export const DEFAULT_DETECT_OPTIONS: DetectOptions = { alpha_threshold: 8, min_gap: 2, min_segment: 4 };

const BACKGROUND_TOLERANCE = 24;

function segments(occupancy: Uint32Array, min_gap: number, min_segment: number): Range[] {
  const raw: Range[] = [];
  let start = -1;
  for (let i = 0; i < occupancy.length; i++) {
    const filled = occupancy[i] > 0;
    if (filled && start < 0) start = i;
    if (!filled && start >= 0) {
      raw.push({ start, end: i });
      start = -1;
    }
  }
  if (start >= 0) raw.push({ start, end: occupancy.length });

  const merged: Range[] = [];
  for (const segment of raw) {
    const last = merged.at(-1);
    if (last && segment.start - last.end < min_gap) last.end = segment.end;
    else merged.push({ ...segment });
  }

  return merged.filter((s) => s.end - s.start >= min_segment);
}

/** The most common corner colour, taken as the background of a fully opaque sheet. */
function corner_background(data: Uint8ClampedArray, width: number, height: number): [number, number, number] {
  const pick = (x: number, y: number): [number, number, number] => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [pick(0, 0), pick(width - 1, 0), pick(0, height - 1), pick(width - 1, height - 1)];
  const counts = new Map<string, number>();
  for (const corner of corners) counts.set(corner.join(","), (counts.get(corner.join(",")) ?? 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  return corners.find((corner) => corner.join(",") === best)!;
}

/** Separator gaps from alpha, or from the corner colour when the sheet has no transparency. */
export function detect_grid(
  ctx: CanvasRenderingContext2D,
  options: DetectOptions = DEFAULT_DETECT_OPTIONS
): { columns: Range[]; rows: Range[] } | null {
  const { width, height } = ctx.canvas;
  if (!width || !height) return null;
  const data = ctx.getImageData(0, 0, width, height).data;

  let has_alpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] <= options.alpha_threshold) {
      has_alpha = true;
      break;
    }
  }

  const background = has_alpha ? null : corner_background(data, width, height);
  const is_empty = (i: number) =>
    background
      ? Math.abs(data[i] - background[0]) <= BACKGROUND_TOLERANCE &&
        Math.abs(data[i + 1] - background[1]) <= BACKGROUND_TOLERANCE &&
        Math.abs(data[i + 2] - background[2]) <= BACKGROUND_TOLERANCE
      : data[i + 3] <= options.alpha_threshold;

  const column_fill = new Uint32Array(width);
  const row_fill = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!is_empty((y * width + x) * 4)) {
        column_fill[x]++;
        row_fill[y]++;
      }
    }
  }

  const columns = segments(column_fill, options.min_gap, options.min_segment);
  const rows = segments(row_fill, options.min_gap, options.min_segment);
  if (!columns.length || !rows.length) return null;

  return { columns, rows };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Detected ranges as settings plus line overrides: the grid shows exactly what was detected while the numeric inputs
 * still show sensible values.
 */
export function detection_to_state(
  width: number,
  height: number,
  detected: { columns: Range[]; rows: Range[] },
  previous: SpriteSettings
): { settings: SpriteSettings; overrides: SpriteOverrides } {
  const { columns, rows } = detected;

  const gaps = (ranges: Range[]) => ranges.slice(1).map((range, i) => range.start - ranges[i].end);

  const settings: SpriteSettings = {
    ...previous,
    mode: GridMode.GRID,
    columns: columns.length,
    rows: rows.length,
    padding: {
      left: columns[0].start,
      right: width - columns[columns.length - 1].end,
      top: rows[0].start,
      bottom: height - rows[rows.length - 1].end,
    },
    spacing: { x: Math.round(median(gaps(columns))), y: Math.round(median(gaps(rows))) },
  };

  const base = compute_base_grid(width, height, settings);
  const overrides: SpriteOverrides = { columns: {}, rows: {}, frames: {} };

  const diff = (a: Range, b: Range): RangeOverride | null => {
    const o: RangeOverride = {};
    if (Math.abs(a.start - b.start) > 0.5) o.start = a.start;
    if (Math.abs(a.end - b.end) > 0.5) o.end = a.end;
    return Object.keys(o).length ? o : null;
  };

  columns.forEach((range, i) => {
    const o = diff(range, base.columns[i]);
    if (o) overrides.columns[i] = o;
  });
  rows.forEach((range, i) => {
    const o = diff(range, base.rows[i]);
    if (o) overrides.rows[i] = o;
  });

  return { settings, overrides };
}

/** Bounding box of the non-transparent pixels inside `rect`, in image coordinates. `null` when empty. */
export function content_bounds(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  alpha_threshold = DEFAULT_DETECT_OPTIONS.alpha_threshold
): Rect | null {
  const r = round_rect(clamp_rect(rect, ctx.canvas.width, ctx.canvas.height));
  if (r.w <= 0 || r.h <= 0) return null;
  const data = ctx.getImageData(r.x, r.y, r.w, r.h).data;

  let min_x = r.w;
  let min_y = r.h;
  let max_x = -1;
  let max_y = -1;
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (data[(y * r.w + x) * 4 + 3] > alpha_threshold) {
        if (x < min_x) min_x = x;
        if (x > max_x) max_x = x;
        if (y < min_y) min_y = y;
        if (y > max_y) max_y = y;
      }
    }
  }
  if (max_x < 0) return null;
  return { x: r.x + min_x, y: r.y + min_y, w: max_x - min_x + 1, h: max_y - min_y + 1 };
}

const SIDES_SCHEMA = z.object({ top: z.number(), right: z.number(), bottom: z.number(), left: z.number() });

export const SETTINGS_SCHEMA: z.ZodType<SpriteSettings> = z.object({
  mode: z.enum([GridMode.GRID, GridMode.SIZE]),
  columns: z.number(),
  rows: z.number(),
  frame_width: z.number(),
  frame_height: z.number(),
  padding: SIDES_SCHEMA,
  spacing: z.object({ x: z.number(), y: z.number() }),
});
