import { z } from "zod";
import { bmp_size, BMP_MAX_BYTES, png_stored_size, PNG_PAD_MIN } from "./test-image-encode";

export const Pattern = {
  RINGS: "rings",
  CHECKER: "checker",
  SPECTRUM: "spectrum",
  GRADIENT: "gradient",
  SOLID: "solid",
  NOISE: "noise",
} as const;
export type Pattern = (typeof Pattern)[keyof typeof Pattern];
export const PATTERNS = Object.values(Pattern) as [Pattern, ...Pattern[]];

export const Gradient = { HORIZONTAL: "horizontal", VERTICAL: "vertical", DIAGONAL: "diagonal", RADIAL: "radial" } as const;
export type Gradient = (typeof Gradient)[keyof typeof Gradient];
export const GRADIENTS = Object.values(Gradient) as [Gradient, ...Gradient[]];

export const TestFormat = { PNG: "png", JPEG: "jpeg", WEBP: "webp", SVG: "svg", BMP: "bmp" } as const;
export type TestFormat = (typeof TestFormat)[keyof typeof TestFormat];
export const TEST_FORMATS = Object.values(TestFormat) as [TestFormat, ...TestFormat[]];

export const MAX_SIDE = 1_000_000;
/** Above this a canvas gets slow and memory-hungry; PNG streams instead, JPEG and WebP refuse. */
export const CANVAS_MAX_SIDE = 16_384;
export const CANVAS_MAX_AREA = 120_000_000;
const WEBP_MAX_SIDE = 16_383;
const SVG_MAX_SHAPES = 250_000;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i);

export const test_image_schema = z.object({
  width: z.number().int().min(1).max(MAX_SIDE),
  height: z.number().int().min(1).max(MAX_SIDE),
  pattern: z.enum(PATTERNS),
  cell: z.number().int().min(1).max(100_000),
  hues: z.number().int().min(1).max(64),
  saturation: z.number().min(0).max(100),
  lightness: z.number().min(0).max(100),
  color: hex,
  color_2: hex,
  gradient: z.enum(GRADIENTS),
  seed: z.number().int().min(0).max(0xffffffff),
  ink: hex,
  border: z.number().int().min(0).max(10_000),
  rulers: z.number().int().min(0).max(100_000),
  grid: z.boolean(),
  crosshair: z.boolean(),
  corners: z.boolean(),
  label: z.string().max(200),
});
export type TestImageSpec = z.infer<typeof test_image_schema>;

export const test_output_schema = z.object({
  format: z.enum(TEST_FORMATS),
  quality: z.number().min(1).max(100),
  target: z.number().int().min(1).nullable(),
});
export type TestOutput = z.infer<typeof test_output_schema>;

export const DEFAULT_SPEC: TestImageSpec = {
  width: 1920,
  height: 1080,
  pattern: Pattern.RINGS,
  cell: 24,
  hues: 9,
  saturation: 65,
  lightness: 50,
  color: "#3b82f6",
  color_2: "#f97316",
  gradient: Gradient.HORIZONTAL,
  seed: 1,
  ink: "#ffffff",
  border: 4,
  rulers: 100,
  grid: false,
  crosshair: true,
  corners: true,
  label: "{w} × {h}",
};

export const DEFAULT_OUTPUT: TestOutput = { format: TestFormat.PNG, quality: 92, target: null };


export function parse_dimensions(text: string): { width: number; height: number } | null {
  const match = /^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i.exec(text);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (width < 1 || height < 1 || width > MAX_SIDE || height > MAX_SIDE) return null;
  return { width, height };
}

export const Mode = { CANVAS: "canvas", STREAM: "stream", SVG: "svg" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export type OutputPlan =
  | { ok: true; mode: Mode; width: number; height: number; bytes: number | null; pad: number; note: string }
  | { ok: false; error: string };

const fits_canvas = (width: number, height: number, max_side = CANVAS_MAX_SIDE) =>
  width <= max_side && height <= max_side && width * height <= CANVAS_MAX_AREA;

export function dimensions_for_bytes(
  target: number,
  ratio: number,
  size_of: (width: number, height: number) => number,
  min_pad: number
): { width: number; height: number; pad: number } | null {
  const fits = (width: number, height: number) => {
    const pad = target - size_of(width, height);
    return pad === 0 || pad >= min_pad;
  };
  let width = Math.max(1, Math.min(MAX_SIDE, Math.round(Math.sqrt((target / 3) * ratio))));
  while (width > 1 && !fits(width, 1)) width = Math.max(1, Math.floor(width / 2));
  if (!fits(width, 1)) return null;
  let low = 1;
  let high = MAX_SIDE;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(width, middle)) low = middle;
    else high = middle - 1;
  }
  return { width, height: low, pad: target - size_of(width, low) };
}

export function plan_output(spec: Pick<TestImageSpec, "width" | "height" | "pattern" | "cell">, output: TestOutput): OutputPlan {
  const { format, target } = output;
  if (target !== null) {
    if (format !== TestFormat.PNG && format !== TestFormat.BMP)
      return { ok: false, error: "An exact file size needs PNG or BMP: the other formats compress unpredictably" };
    if (format === TestFormat.BMP && target > BMP_MAX_BYTES) return { ok: false, error: "A BMP can't be larger than 4 GB; use PNG" };
    const size_of = format === TestFormat.BMP ? bmp_size : png_stored_size;
    const found = dimensions_for_bytes(target, spec.width / spec.height, size_of, format === TestFormat.BMP ? 0 : PNG_PAD_MIN);
    if (!found) return { ok: false, error: `${target} bytes is too small for a ${format.toUpperCase()}` };
    return { ok: true, mode: Mode.STREAM, ...found, bytes: target, note: stream_note(format) };
  }

  const { width, height } = spec;
  switch (format) {
    case TestFormat.BMP: {
      const bytes = bmp_size(width, height);
      if (bytes > BMP_MAX_BYTES) return { ok: false, error: "A BMP can't be larger than 4 GB; use PNG" };
      return { ok: true, mode: Mode.STREAM, width, height, bytes, pad: 0, note: stream_note(format) };
    }
    case TestFormat.PNG:
      if (fits_canvas(width, height)) return { ok: true, mode: Mode.CANVAS, width, height, bytes: null, pad: 0, note: "Compressed PNG" };
      return { ok: true, mode: Mode.STREAM, width, height, bytes: png_stored_size(width, height), pad: 0, note: stream_note(format) };
    case TestFormat.JPEG:
    case TestFormat.WEBP: {
      const max_side = format === TestFormat.WEBP ? WEBP_MAX_SIDE : CANVAS_MAX_SIDE;
      if (!fits_canvas(width, height, max_side))
        return {
          ok: false,
          error: `${format === TestFormat.WEBP ? "WebP" : "JPEG"} is drawn on a canvas: up to ${max_side} px a side and ${CANVAS_MAX_AREA / 1_000_000} megapixels. Use PNG or BMP for larger images`,
        };
      return { ok: true, mode: Mode.CANVAS, width, height, bytes: null, pad: 0, note: format === TestFormat.WEBP ? "WebP" : "JPEG" };
    }
    case TestFormat.SVG: {
      const shapes = svg_shapes(spec);
      if (shapes > SVG_MAX_SHAPES)
        return { ok: false, error: `That SVG would need ${shapes.toLocaleString()} shapes; use a larger pixel size or a raster format` };
      return { ok: true, mode: Mode.SVG, width, height, bytes: null, pad: 0, note: "Vector, scales to any size" };
    }
  }
}

function stream_note(format: TestFormat): string {
  return format === TestFormat.BMP ? "Uncompressed BMP, written in bands" : "Uncompressed PNG, written in bands";
}

function svg_shapes(spec: Pick<TestImageSpec, "width" | "height" | "pattern" | "cell">): number {
  if (spec.pattern !== Pattern.RINGS) return 1;
  return Math.ceil(Math.min(Math.ceil(spec.width / spec.cell), Math.ceil(spec.height / spec.cell)) / 2);
}

export function extension_of(format: TestFormat): string {
  return format === TestFormat.JPEG ? "jpg" : format;
}

export function mime_of(format: TestFormat): string {
  return format === TestFormat.SVG ? "image/svg+xml" : `image/${format}`;
}

export function label_text(template: string, width: number, height: number, format: TestFormat): string {
  return template
    .replaceAll("{w}", String(width))
    .replaceAll("{h}", String(height))
    .replaceAll("{format}", format.toUpperCase());
}

export function test_image_name(spec: Pick<TestImageSpec, "pattern">, width: number, height: number, format: TestFormat): string {
  return `test-${spec.pattern}-${width}x${height}.${extension_of(format)}`;
}


export type Rgb = [number, number, number];

export function hex_rgb(value: string): Rgb {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hsl_rgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const pure = hue_unit(h);
  return [0, 1, 2].map((i) => Math.round((l + c * (pure[i] - 0.5)) * 255)) as Rgb;
}

function hue_unit(h: number): [number, number, number] {
  const turn = ((h % 1) + 1) % 1;
  const channel = (offset: number) => {
    const k = (offset + turn * 12) % 12;
    return 0.5 - 0.5 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

export const rgb_css = ([r, g, b]: Rgb) => `rgb(${r} ${g} ${b})`;

/**
 * The colour pairs of the ported pixel grid: one hue per ring from the outside in, each a light and a darker cell. Same
 * order as the original (hues reversed), so ring 0 is the last hue.
 */
export function ring_schemes(spec: Pick<TestImageSpec, "hues" | "saturation" | "lightness">): [Rgb, Rgb][] {
  const s = spec.saturation / 100;
  const l = spec.lightness / 100;
  const dark = Math.max(0, l - 0.1);
  return Array.from({ length: spec.hues }, (_, index) => {
    const h = (spec.hues - 1 - index) / spec.hues;
    return [hsl_rgb(h, s, l), hsl_rgb(h, s, dark)] as [Rgb, Rgb];
  });
}

const pack = ([r, g, b]: Rgb) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;

/** A small integer hash, so noise is the same for a pixel whichever band or tile draws it. */
function noise_at(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}


export interface Tile {
  x: number;
  y: number;
  columns: number;
  rows: number;
  scale: number;
}

export function fill_base(pixels: Uint32Array, spec: TestImageSpec, tile: Tile): void {
  const { columns, rows } = tile;
  const xs = new Int32Array(columns);
  for (let i = 0; i < columns; i++) xs[i] = Math.min(spec.width - 1, Math.floor(tile.x + i / tile.scale));
  const y_at = (j: number) => Math.min(spec.height - 1, Math.floor(tile.y + j / tile.scale));

  switch (spec.pattern) {
    case Pattern.SOLID:
      pixels.fill(pack(hex_rgb(spec.color)), 0, columns * rows);
      return;
    case Pattern.RINGS: {
      const schemes = ring_schemes(spec).map(([light, dark]) => [pack(light), pack(dark)]);
      const cell = spec.cell;
      const cols = Math.ceil(spec.width / cell);
      const cell_rows = Math.ceil(spec.height / cell);
      const cx = Int32Array.from(xs, (x) => Math.floor(x / cell));
      for (let j = 0; j < rows; j++) {
        const cy = Math.floor(y_at(j) / cell);
        const edge_y = Math.min(cy, cell_rows - 1 - cy);
        const row = j * columns;
        for (let i = 0; i < columns; i++) {
          const c = cx[i];
          const ring = Math.min(edge_y, c, cols - 1 - c);
          pixels[row + i] = schemes[ring % schemes.length][(c + cy) & 1];
        }
      }
      return;
    }
    case Pattern.CHECKER: {
      const colors = [pack(hex_rgb(spec.color)), pack(hex_rgb(spec.color_2))];
      const cx = Int32Array.from(xs, (x) => Math.floor(x / spec.cell));
      for (let j = 0; j < rows; j++) {
        const cy = Math.floor(y_at(j) / spec.cell);
        const row = j * columns;
        for (let i = 0; i < columns; i++) pixels[row + i] = colors[(cx[i] + cy) & 1];
      }
      return;
    }
    case Pattern.SPECTRUM: {
      // Hue runs left to right, lightness from 90% at the top to 10% at the bottom: every region looks different.
      const s = spec.saturation / 100;
      const units = Array.from(xs, (x) => hue_unit(spec.width === 1 ? 0 : x / spec.width));
      for (let j = 0; j < rows; j++) {
        const y = y_at(j);
        const l = 0.9 - 0.8 * (spec.height === 1 ? 0.5 : y / (spec.height - 1));
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const row = j * columns;
        for (let i = 0; i < columns; i++) {
          const unit = units[i];
          const r = Math.round((l + c * (unit[0] - 0.5)) * 255);
          const g = Math.round((l + c * (unit[1] - 0.5)) * 255);
          const b = Math.round((l + c * (unit[2] - 0.5)) * 255);
          pixels[row + i] = ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
        }
      }
      return;
    }
    case Pattern.GRADIENT: {
      const from = hex_rgb(spec.color);
      const to = hex_rgb(spec.color_2);
      const lut = new Uint32Array(256);
      for (let k = 0; k < 256; k++) {
        const t = k / 255;
        lut[k] = pack([0, 1, 2].map((c) => Math.round(from[c] + (to[c] - from[c]) * t)) as Rgb);
      }
      const w = Math.max(1, spec.width - 1);
      const h = Math.max(1, spec.height - 1);
      const radius = Math.hypot(spec.width / 2, spec.height / 2);
      for (let j = 0; j < rows; j++) {
        const y = y_at(j);
        const row = j * columns;
        for (let i = 0; i < columns; i++) {
          const x = xs[i];
          let t: number;
          if (spec.gradient === Gradient.HORIZONTAL) t = x / w;
          else if (spec.gradient === Gradient.VERTICAL) t = y / h;
          else if (spec.gradient === Gradient.DIAGONAL) t = (x / w + y / h) / 2;
          else t = Math.min(1, Math.hypot(x + 0.5 - spec.width / 2, y + 0.5 - spec.height / 2) / radius);
          pixels[row + i] = lut[Math.round(t * 255)];
        }
      }
      return;
    }
    case Pattern.NOISE: {
      for (let j = 0; j < rows; j++) {
        const y = y_at(j);
        const row = j * columns;
        for (let i = 0; i < columns; i++) pixels[row + i] = (noise_at(xs[i], y, spec.seed) | 0xff000000) >>> 0;
      }
      return;
    }
  }
}


export type Mark =
  | { kind: "rect"; x: number; y: number; width: number; height: number; color: string }
  | {
      kind: "text";
      x: number;
      y: number;
      text: string;
      size: number;
      align: "left" | "center" | "right";
      baseline: "top" | "middle" | "bottom";
      color: string;
      plate: string | null;
    };

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const PLATE = "#000000a6";
const CHAR_WIDTH = 0.62;

export function text_box(mark: Extract<Mark, { kind: "text" }>): Rect {
  const width = mark.text.length * mark.size * CHAR_WIDTH + mark.size * 0.6;
  const height = mark.size * 1.4;
  const x = mark.align === "left" ? mark.x : mark.align === "center" ? mark.x - width / 2 : mark.x - width;
  const y = mark.baseline === "top" ? mark.y : mark.baseline === "middle" ? mark.y - height / 2 : mark.y - height;
  return { x, y, width, height };
}

function mark_box(mark: Mark): Rect {
  return mark.kind === "rect" ? mark : text_box(mark);
}

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

export function label_every(step: number, size: number, longest: number): number {
  const needed = longest * size * CHAR_WIDTH + size;
  for (const k of [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]) if (step * k >= needed) return k;
  return 1000;
}

export function ruler_font(spec: Pick<TestImageSpec, "width" | "height">): number {
  return Math.max(10, Math.min(48, Math.round(Math.min(spec.width, spec.height) / 60)));
}

export function overlay_marks(spec: TestImageSpec, view: Rect, format: TestFormat = TestFormat.PNG): Mark[] {
  const { width: W, height: H, ink } = spec;
  const marks: Mark[] = [];
  const short = Math.min(W, H);
  const line = Math.max(1, Math.round(short / 500));
  const corner_size = Math.max(10, Math.min(64, Math.round(short / 40)));
  const corner_thick = Math.max(2, line * 3);
  const corner_inset = spec.border + corner_thick + 2;

  if (spec.rulers > 0) {
    const step = spec.rulers;
    const size = ruler_font(spec);
    const every = label_every(step, size, String(Math.max(W, H)).length);
    const minor = Math.max(3, Math.round(size * 0.6));
    const major = minor * 2;
    const faint = `${ink}59`;
    // Numbers stay clear of the image edges and of the corner coordinates.
    const half = (text: string) => (text.length * size * CHAR_WIDTH + size * 0.6) / 2;
    const corner_width = spec.corners ? corner_inset + `${W - 1},${H - 1}`.length * corner_size * CHAR_WIDTH + corner_size * 0.6 : 0;
    const corner_height = spec.corners ? corner_inset + corner_size * 1.4 : 0;
    const fits_x = (x: number) => x - half(String(x)) >= corner_width && x + half(String(x)) <= W - corner_width;
    const fits_y = (y: number) => y - size * 0.7 >= Math.max(corner_height, major) && y + size * 0.7 <= H - Math.max(corner_height, major);
    const range = (start: number, end: number, limit: number) => [
      Math.max(1, Math.ceil(start / step)),
      Math.min(Math.floor((limit - 1) / step), Math.floor(end / step)),
    ];
    const [x_from, x_to] = range(view.x - size * 4, view.x + view.width + size * 4, W);
    for (let k = x_from; k <= x_to; k++) {
      const x = k * step;
      const big = k % every === 0;
      const length = big ? major : minor;
      if (spec.grid) marks.push({ kind: "rect", x, y: 0, width: 1, height: H, color: faint });
      marks.push({ kind: "rect", x, y: 0, width: 1, height: length, color: ink });
      marks.push({ kind: "rect", x, y: H - length, width: 1, height: length, color: ink });
      if (big && fits_x(x)) {
        marks.push({ kind: "text", x, y: major + 2, text: String(x), size, align: "center", baseline: "top", color: ink, plate: PLATE });
        marks.push({ kind: "text", x, y: H - major - 2, text: String(x), size, align: "center", baseline: "bottom", color: ink, plate: PLATE });
      }
    }
    const [y_from, y_to] = range(view.y - size * 2, view.y + view.height + size * 2, H);
    for (let k = y_from; k <= y_to; k++) {
      const y = k * step;
      const big = k % every === 0;
      const length = big ? major : minor;
      if (spec.grid) marks.push({ kind: "rect", x: 0, y, width: W, height: 1, color: faint });
      marks.push({ kind: "rect", x: 0, y, width: length, height: 1, color: ink });
      marks.push({ kind: "rect", x: W - length, y, width: length, height: 1, color: ink });
      if (big && fits_y(y)) {
        marks.push({ kind: "text", x: major + 2, y, text: String(y), size, align: "left", baseline: "middle", color: ink, plate: PLATE });
        marks.push({ kind: "text", x: W - major - 2, y, text: String(y), size, align: "right", baseline: "middle", color: ink, plate: PLATE });
      }
    }
  }

  if (spec.crosshair) {
    const cx = Math.floor(W / 2);
    const cy = Math.floor(H / 2);
    marks.push({ kind: "rect", x: cx - Math.floor(line / 2), y: 0, width: line, height: H, color: ink });
    marks.push({ kind: "rect", x: 0, y: cy - Math.floor(line / 2), width: W, height: line, color: ink });
  }

  if (spec.border > 0) {
    const b = Math.min(spec.border, Math.ceil(short / 2));
    marks.push({ kind: "rect", x: 0, y: 0, width: W, height: b, color: ink });
    marks.push({ kind: "rect", x: 0, y: H - b, width: W, height: b, color: ink });
    marks.push({ kind: "rect", x: 0, y: 0, width: b, height: H, color: ink });
    marks.push({ kind: "rect", x: W - b, y: 0, width: b, height: H, color: ink });
  }

  if (spec.corners) {
    const arm = Math.max(4, Math.round(short / 10));
    const corners: [number, number, "left" | "right", "top" | "bottom"][] = [
      [0, 0, "left", "top"],
      [W - 1, 0, "right", "top"],
      [0, H - 1, "left", "bottom"],
      [W - 1, H - 1, "right", "bottom"],
    ];
    for (const [x, y, align, baseline] of corners) {
      const left = align === "left";
      const top = baseline === "top";
      marks.push({ kind: "rect", x: left ? 0 : W - arm, y: top ? 0 : H - corner_thick, width: arm, height: corner_thick, color: ink });
      marks.push({ kind: "rect", x: left ? 0 : W - corner_thick, y: top ? 0 : H - arm, width: corner_thick, height: arm, color: ink });
      marks.push({
        kind: "text",
        x: left ? corner_inset : W - corner_inset,
        y: top ? corner_inset : H - corner_inset,
        text: `${x},${y}`,
        size: corner_size,
        align,
        baseline,
        color: ink,
        plate: PLATE,
      });
    }
  }

  const text = label_text(spec.label, W, H, format).trim();
  if (text) {
    const size = Math.max(10, Math.min(Math.round(short / 8), Math.floor((W * 0.8) / (text.length * CHAR_WIDTH + 0.6))));
    const y = spec.crosshair ? Math.floor(H / 2) - Math.round(size * 0.4) : Math.floor(H / 2);
    marks.push({
      kind: "text",
      x: Math.floor(W / 2),
      y,
      text,
      size,
      align: "center",
      baseline: spec.crosshair ? "bottom" : "middle",
      color: ink,
      plate: PLATE,
    });
  }

  // Text last, so numbers stay readable where they cross the corner arms or the crosshair.
  const visible = marks.filter((mark) => overlaps(mark_box(mark), view));
  return [...visible.filter((mark) => mark.kind === "rect"), ...visible.filter((mark) => mark.kind === "text")];
}
