import type { Point } from "./model";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Line {
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

export const LABEL_GAP = 5;
const PAD = 2;
const STEPS = [0, 6, 14, 26, 42, 64];
const SLIDES = [0, -0.6, 0.6];

// Hack, the mono font, advances 0.6 em per character; the labels are mono so their width is known without measuring.
export function text_width(text: string, font_size: number): number {
  return [...text].length * font_size * 0.6;
}

export function center_rect(center: Point, width: number, height: number): Rect {
  return { x: center.x - width / 2, y: center.y - height / 2, w: width, h: height };
}

export function rect_center(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

function grow(rect: Rect, by: number): Rect {
  return { x: rect.x - by, y: rect.y - by, w: rect.w + by * 2, h: rect.h + by * 2 };
}

export function rects_overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Liang–Barsky clipping.
export function line_hits_rect(line: Line, rect: Rect): boolean {
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
 * and no label placed before it. When every spot is taken it keeps the nearest one rather than vanish.
 */
export function place_labels(
  requests: readonly LabelRequest[],
  lines: readonly Line[],
  blocked: readonly Rect[] = []
): Map<string, Rect> {
  const placed = new Map<string, Rect>();
  const taken: Rect[] = [...blocked];
  for (const request of requests) {
    const options = candidates(request);
    const free = options.find((rect) => {
      const padded = grow(rect, PAD);
      return (
        !lines.some((line) => line_hits_rect(line, padded)) && !taken.some((other) => rects_overlap(padded, other))
      );
    });
    const rect = free ?? options[0];
    placed.set(request.id, rect);
    taken.push(rect);
  }
  return placed;
}
