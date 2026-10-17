import { file_stem } from "$lib/core/api/services/files/path";

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

export const SHEET_SIZES = [512, 1024, 2048, 4096, 8192] as const;

export const AtlasFormat = { JSON: "json", CSS: "css" } as const;
export type AtlasFormat = (typeof AtlasFormat)[keyof typeof AtlasFormat];

export interface PackOptions {
  max: number;
  /** Pixels between frames and around the sheet's edge. */
  padding: number;
  /** Edge pixels repeated outward, so texture filtering never samples a neighbour. */
  extrude: number;
  power_of_two: boolean;
}

export type PackResult =
  | { ok: true; width: number; height: number; positions: { x: number; y: number }[]; fill: number }
  | { ok: false; reason: string };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function natural_compare(a: string, b: string): number {
  return collator.compare(a, b);
}

/** Best short side fit, no rotation. */
export class MaxRects {
  private free: Rect[];

  constructor(width: number, height: number) {
    this.free = [{ x: 0, y: 0, w: width, h: height }];
  }

  insert(w: number, h: number): Rect | null {
    let best: Rect | null = null;
    let best_short = Infinity;
    let best_long = Infinity;
    for (const space of this.free) {
      if (space.w < w || space.h < h) continue;
      const left_w = space.w - w;
      const left_h = space.h - h;
      const short = Math.min(left_w, left_h);
      const long = Math.max(left_w, left_h);
      if (short < best_short || (short === best_short && long < best_long)) {
        best = { x: space.x, y: space.y, w, h };
        best_short = short;
        best_long = long;
      }
    }
    if (best) this.place(best);
    return best;
  }

  private place(used: Rect) {
    const next: Rect[] = [];
    for (const space of this.free) {
      if (!overlaps(space, used)) next.push(space);
      else next.push(...split(space, used));
    }
    this.free = next.filter((space, i) => !next.some((other, j) => i !== j && contains(other, space) && (!contains(space, other) || j < i)));
  }
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

function split(space: Rect, used: Rect): Rect[] {
  const parts: Rect[] = [];
  if (used.x > space.x) parts.push({ x: space.x, y: space.y, w: used.x - space.x, h: space.h });
  if (used.x + used.w < space.x + space.w) parts.push({ x: used.x + used.w, y: space.y, w: space.x + space.w - used.x - used.w, h: space.h });
  if (used.y > space.y) parts.push({ x: space.x, y: space.y, w: space.w, h: used.y - space.y });
  if (used.y + used.h < space.y + space.h) parts.push({ x: space.x, y: used.y + used.h, w: space.w, h: space.y + space.h - used.y - used.h });
  return parts;
}

/** Bigger frames first pack tighter; ties keep input order so the result is stable. */
function pack_into(cells: Size[], width: number, height: number): { x: number; y: number }[] | null {
  const bin = new MaxRects(width, height);
  const order = cells.map((_, i) => i).sort((a, b) => Math.max(cells[b].w, cells[b].h) - Math.max(cells[a].w, cells[a].h) || cells[b].w * cells[b].h - cells[a].w * cells[a].h || a - b);
  const spots: { x: number; y: number }[] = new Array(cells.length);
  for (const i of order) {
    const spot = bin.insert(cells[i].w, cells[i].h);
    if (!spot) return null;
    spots[i] = { x: spot.x, y: spot.y };
  }
  return spots;
}

export function next_power_of_two(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(1, value)));
}

/** Powers of two and the halfway steps between them, so a sheet that isn't held to powers of two can be smaller. */
function side_steps(max: number, power_of_two: boolean): number[] {
  const steps: number[] = [];
  for (let side = 16; side < max; side *= 2) {
    steps.push(side);
    if (!power_of_two && side * 1.5 < max) steps.push(side * 1.5);
  }
  steps.push(max);
  return steps;
}

/**
 * Packs frames of the given sizes into the smallest sheet that holds them: the shortest longest side first, then the
 * least area. Each frame takes its size plus the extrude on every side plus the padding, and the sheet keeps the padding
 * along its top and left edge too.
 */
export function pack(sizes: Size[], options: PackOptions): PackResult {
  if (!sizes.length) return { ok: false, reason: "No frames to pack." };
  const max = Math.max(1, Math.floor(options.max));
  const padding = Math.max(0, Math.floor(options.padding));
  const extrude = Math.max(0, Math.floor(options.extrude));
  const cells = sizes.map((size) => ({ w: size.w + extrude * 2 + padding, h: size.h + extrude * 2 + padding }));
  const room = max - padding;

  const too_big = cells.findIndex((cell) => cell.w > room || cell.h > room);
  if (too_big >= 0) {
    const { w, h } = sizes[too_big];
    return { ok: false, reason: `Frame ${too_big + 1} is ${w} × ${h} px with its padding and extrude bigger than ${max} × ${max}.` };
  }
  const area = cells.reduce((sum, cell) => sum + cell.w * cell.h, 0);
  const widest = Math.max(...cells.map((cell) => cell.w));
  const tallest = Math.max(...cells.map((cell) => cell.h));
  if (area > room * room || !pack_into(cells, room, room)) {
    return { ok: false, reason: `${sizes.length} frames don't fit in ${max} × ${max}. Raise the max size, trim the frames or lower the padding.` };
  }

  const steps = side_steps(max, options.power_of_two);
  const candidates = steps
    .flatMap((w) => steps.map((h) => ({ w, h })))
    .filter(({ w, h }) => w - padding >= widest && h - padding >= tallest && (w - padding) * (h - padding) >= area)
    .sort((a, b) => Math.max(a.w, a.h) - Math.max(b.w, b.h) || a.w * a.h - b.w * b.h || b.w - a.w);

  for (const candidate of candidates) {
    const spots = pack_into(cells, candidate.w - padding, candidate.h - padding);
    if (!spots) continue;
    const used_w = padding + Math.max(...spots.map((spot, i) => spot.x + cells[i].w));
    const used_h = padding + Math.max(...spots.map((spot, i) => spot.y + cells[i].h));
    const width = options.power_of_two ? next_power_of_two(used_w) : used_w;
    const height = options.power_of_two ? next_power_of_two(used_h) : used_h;
    const pixels = sizes.reduce((sum, size) => sum + size.w * size.h, 0);
    return {
      ok: true,
      width,
      height,
      positions: spots.map((spot) => ({ x: padding + spot.x + extrude, y: padding + spot.y + extrude })),
      fill: pixels / (width * height),
    };
  }
  return { ok: false, reason: `${sizes.length} frames don't fit in ${max} × ${max}.` };
}

export interface AtlasFrame {
  name: string;
  /** On the sheet, trimmed size. */
  frame: Rect;
  /** The trimmed box inside the original image. */
  source: Rect;
  source_size: Size;
}

/** The TexturePacker "JSON (Hash)" format that Phaser, PixiJS and most engines read. */
export function atlas_json(frames: AtlasFrame[], image: string, sheet: Size): string {
  const entries = frames.map((item) => [
    item.name,
    {
      frame: item.frame,
      rotated: false,
      trimmed: item.source.w !== item.source_size.w || item.source.h !== item.source_size.h,
      spriteSourceSize: item.source,
      sourceSize: item.source_size,
    },
  ]);
  const meta = { app: "WebOS Image Tools", version: "1.0", image, format: "RGBA8888", size: sheet, scale: "1" };
  return JSON.stringify({ frames: Object.fromEntries(entries), meta }, null, 2);
}

export function css_class(name: string): string {
  const slug = file_stem(name)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /^[a-z_]/.test(slug) ? slug : `_${slug}`;
}

export function atlas_css(frames: AtlasFrame[], image: string): string {
  const taken = new Set<string>();
  const rules = frames.map((item) => {
    let name = css_class(item.name);
    for (let n = 2; taken.has(name); n++) name = `${css_class(item.name)}-${n}`;
    taken.add(name);
    const { x, y, w, h } = item.frame;
    return `.sprite-${name} {\n  width: ${w}px;\n  height: ${h}px;\n  background-position: ${-x}px ${-y}px;\n}`;
  });
  return [`.sprite {\n  display: inline-block;\n  background-image: url("${image}");\n  background-repeat: no-repeat;\n}`, ...rules].join("\n\n") + "\n";
}

/** `run.png` twice becomes `run.png` and `run (2).png`: the JSON keys must be unique. */
export function unique_names(names: string[]): string[] {
  const taken = new Set<string>();
  return names.map((name) => {
    let candidate = name;
    const dot = name.lastIndexOf(".");
    const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
    for (let n = 2; taken.has(candidate); n++) candidate = `${base} (${n})${ext}`;
    taken.add(candidate);
    return candidate;
  });
}
