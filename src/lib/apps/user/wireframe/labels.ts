import type { Point } from "./projection";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Segment {
  a: Point;
  b: Point;
}

export interface LabelRequest {
  id: string;
  anchor: Point;
  sides: Point[];
  width: number;
  height: number;
}

export const LABEL_GAP = 4;
const PAD = 2;
const STEPS = [0, 6, 14, 26, 42];
const SLIDES = [0, -0.6, 0.6];
const CELL = 64;

// Hack, the mono font, advances 0.6 em per character; the labels are mono so their width is known without measuring.
export function text_width(text: string, font_size: number): number {
  return [...text].length * font_size * 0.6;
}

export function center_rect(center: Point, width: number, height: number): Rect {
  return { x: center.x - width / 2, y: center.y - height / 2, w: width, h: height };
}

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

export function rects_overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Liang–Barsky clipping.
export function segment_hits_rect(line: Segment, rect: Rect): boolean {
  const dx = line.b.x - line.a.x;
  const dy = line.b.y - line.a.y;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, line.a.x - rect.x],
    [dx, rect.x + rect.w - line.a.x],
    [-dy, line.a.y - rect.y],
    [dy, rect.y + rect.h - line.a.y],
  ];
  for (const [p, q] of edges) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
}

// Every label checks every line around it on every frame of an orbit; a coarse grid keeps that to the lines nearby.
class Grid<T> {
  private readonly cells = new Map<string, T[]>();

  add(box: Rect, item: T): void {
    for (const key of this.keys(box)) {
      const list = this.cells.get(key);
      if (list) list.push(item);
      else this.cells.set(key, [item]);
    }
  }

  near(box: Rect): Set<T> {
    const out = new Set<T>();
    for (const key of this.keys(box)) for (const item of this.cells.get(key) ?? []) out.add(item);
    return out;
  }

  private *keys(box: Rect): Generator<string> {
    const x0 = Math.floor(box.x / CELL);
    const x1 = Math.floor((box.x + box.w) / CELL);
    const y0 = Math.floor(box.y / CELL);
    const y1 = Math.floor((box.y + box.h) / CELL);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) yield `${x}:${y}`;
  }
}

function segment_box(line: Segment): Rect {
  const x = Math.min(line.a.x, line.b.x);
  const y = Math.min(line.a.y, line.b.y);
  return { x, y, w: Math.abs(line.b.x - line.a.x), h: Math.abs(line.b.y - line.a.y) };
}

function candidates(request: LabelRequest): Rect[] {
  const out: Rect[] = [];
  for (const side of request.sides) {
    const tangent = { x: -side.y, y: side.x };
    const reach = (Math.abs(side.x) * request.width) / 2 + (Math.abs(side.y) * request.height) / 2;
    for (const slide of SLIDES) {
      for (const step of STEPS) {
        const along = slide * (Math.abs(tangent.x) * request.width + Math.abs(tangent.y) * request.height);
        const distance = LABEL_GAP + step + reach;
        const center = {
          x: request.anchor.x + side.x * distance + tangent.x * along,
          y: request.anchor.y + side.y * distance + tangent.y * along,
        };
        out.push(center_rect(center, request.width, request.height));
      }
    }
  }
  return out;
}

/**
 * Greedy, in request order: each label takes the first spot, nearest first on its preferred side, that crosses no line
 * and no label placed before it. Failing that, the nearest spot clear of labels, even across a line; a label with no
 * such spot is left out, since stacked text can't be read anyway.
 */
export function place_labels(
  requests: readonly LabelRequest[],
  lines: readonly Segment[],
  blocked: readonly Rect[] = []
): Map<string, Rect> {
  const line_grid = new Grid<Segment>();
  for (const line of lines) line_grid.add(segment_box(line), line);
  const taken = new Grid<Rect>();
  for (const rect of blocked) taken.add(rect, rect);
  const placed = new Map<string, Rect>();
  for (const request of requests) {
    const options = candidates(request);
    const clear_of_labels = (rect: Rect) => {
      const padded = grow(rect, PAD);
      for (const other of taken.near(padded)) if (rects_overlap(padded, other)) return false;
      return true;
    };
    const free = options.find((rect) => {
      const padded = grow(rect, PAD);
      for (const line of line_grid.near(padded)) if (segment_hits_rect(line, padded)) return false;
      return clear_of_labels(rect);
    });
    const rect = free ?? options.find(clear_of_labels);
    if (!rect) continue;
    placed.set(request.id, rect);
    taken.add(rect, rect);
  }
  return placed;
}
