import type { Rgba } from "./flood-fill";

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Ellipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export function rect_from(a: Point, b: Point, square = false): Rect {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), width: Math.abs(dx), height: Math.abs(dy) };
}

export function ellipse_in(rect: Rect): Ellipse {
  return { cx: rect.x + rect.width / 2, cy: rect.y + rect.height / 2, rx: rect.width / 2, ry: rect.height / 2 };
}

export function snap_line(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return { x: Math.round(a.x + Math.cos(angle) * length), y: Math.round(a.y + Math.sin(angle) * length) };
}

export function line_points(a: Point, b: Point): Point[] {
  let x = Math.round(a.x);
  let y = Math.round(a.y);
  const end_x = Math.round(b.x);
  const end_y = Math.round(b.y);
  const dx = Math.abs(end_x - x);
  const dy = -Math.abs(end_y - y);
  const step_x = x < end_x ? 1 : -1;
  const step_y = y < end_y ? 1 : -1;
  let error = dx + dy;
  const points: Point[] = [];

  for (;;) {
    points.push({ x, y });
    if (x === end_x && y === end_y) return points;
    const double = 2 * error;
    if (double >= dy) {
      error += dy;
      x += step_x;
    }
    if (double <= dx) {
      error += dx;
      y += step_y;
    }
  }
}

export function to_canvas_point(client: Point, box: Rect, width: number, height: number): Point {
  return {
    x: ((client.x - box.x) / box.width) * width,
    y: ((client.y - box.y) / box.height) * height,
  };
}

export const ZOOM_LEVELS = [0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16] as const;

export function step_zoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_LEVELS.find((level) => level > zoom + 1e-6) ?? ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
  return [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 1e-6) ?? ZOOM_LEVELS[0];
}

/** The largest zoom level that shows the whole canvas in the viewport, never above 100%. */
export function fit_zoom(width: number, height: number, view_width: number, view_height: number): number {
  const fit = Math.min(view_width / width, view_height / height, 1);
  return [...ZOOM_LEVELS].reverse().find((level) => level <= fit) ?? ZOOM_LEVELS[0];
}

export const MAX_SIDE = 8192;

export function clamp_side(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_SIDE, Math.max(1, Math.round(value))) : 1;
}

export function parse_hex(hex: string): Rgba {
  const match = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(hex.trim());
  if (!match) return [0, 0, 0, 255];
  const value = parseInt(match[1], 16);
  const alpha = match[2] ? parseInt(match[2], 16) : 255;
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];
}

export function to_hex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function push_recent(recent: readonly string[], color: string, max = 8): string[] {
  const value = color.toLowerCase();
  return [value, ...recent.filter((item) => item !== value)].slice(0, max);
}
