import type { LineAxis, LineEdge, PaddingSide, Rect, SpriteGrid, SpriteOverrides } from "./sprite-model";

export const HIT_TOLERANCE = 6;
export const HANDLE_SIZE = 7;
/** A fingertip covers ~40 px and hides what it's on, so touch and pen grab from much further away. */
export const TOUCH_HIT_TOLERANCE = 18;
export const TOUCH_HANDLE_SIZE = 13;
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 64;

export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export interface LineRef {
  axis: LineAxis;
  index: number;
  edge: LineEdge;
  /** Set on the outermost lines: dragging them changes padding instead of adding an override. */
  outer?: PaddingSide;
  /** Image coordinates. */
  position: number;
}

export type Hit =
  | { type: "handle"; frame: number; handle: Handle }
  | { type: "line"; lines: LineRef[] }
  | { type: "frame"; index: number }
  | { type: "none" };

export type Drag =
  | { kind: "pan"; start_x: number; start_y: number; offset_x: number; offset_y: number }
  | { kind: "line"; lines: LineRef[] }
  | { kind: "frame-move"; index: number; start: Rect; start_x: number; start_y: number; moved: boolean }
  | { kind: "frame-resize"; index: number; handle: Handle; start: Rect };

export interface View {
  scale: number;
  offset_x: number;
  offset_y: number;
}

export interface Point {
  x: number;
  y: number;
}

export function to_screen(view: View, x: number, y: number): Point {
  return { x: x * view.scale + view.offset_x, y: y * view.scale + view.offset_y };
}

export function to_image(view: View, sx: number, sy: number): Point {
  return { x: (sx - view.offset_x) / view.scale, y: (sy - view.offset_y) / view.scale };
}

export function clamp_scale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

/** View that fits a `width` × `height` image into a `cw` × `ch` viewport with a margin. */
export function fit_view(width: number, height: number, cw: number, ch: number, margin = 24): View {
  const scale = clamp_scale(Math.min((cw - margin * 2) / width, (ch - margin * 2) / height));
  return { scale, offset_x: (cw - width * scale) / 2, offset_y: (ch - height * scale) / 2 };
}

/** Zooms by `factor` keeping the screen point under (`sx`, `sy`) still. */
export function zoom_view(view: View, factor: number, sx: number, sy: number): View {
  const scale = clamp_scale(view.scale * factor);
  const k = scale / view.scale;
  return { scale, offset_x: sx - (sx - view.offset_x) * k, offset_y: sy - (sy - view.offset_y) * k };
}

/** Two-finger view: the image point that was under the starting midpoint follows the midpoint, scaled by the spread. */
export function pinch_view(start: View, start_mid: Point, start_distance: number, mid: Point, distance: number): View {
  const scale = clamp_scale(start.scale * (distance / Math.max(1, start_distance)));
  const anchor = to_image(start, start_mid.x, start_mid.y);
  return { scale, offset_x: mid.x - anchor.x * scale, offset_y: mid.y - anchor.y * scale };
}

export function grid_lines(grid: SpriteGrid): LineRef[] {
  const lines: LineRef[] = [];
  const last_column = grid.columns.length - 1;
  const last_row = grid.rows.length - 1;
  grid.columns.forEach((c, i) => {
    lines.push({ axis: "column", index: i, edge: "start", position: c.start, outer: i === 0 ? "left" : undefined });
    lines.push({ axis: "column", index: i, edge: "end", position: c.end, outer: i === last_column ? "right" : undefined });
  });
  grid.rows.forEach((r, i) => {
    lines.push({ axis: "row", index: i, edge: "start", position: r.start, outer: i === 0 ? "top" : undefined });
    lines.push({ axis: "row", index: i, edge: "end", position: r.end, outer: i === last_row ? "bottom" : undefined });
  });
  return lines;
}

export function is_line_overridden(overrides: SpriteOverrides, line: LineRef): boolean {
  const map = line.axis === "column" ? overrides.columns : overrides.rows;
  return map[line.index]?.[line.edge] !== undefined;
}

function handle_points(view: View, frame: Rect): Record<Handle, Point> {
  const a = to_screen(view, frame.x, frame.y);
  const b = to_screen(view, frame.x + frame.w, frame.y + frame.h);
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  return {
    nw: { x: a.x, y: a.y },
    n: { x: mx, y: a.y },
    ne: { x: b.x, y: a.y },
    e: { x: b.x, y: my },
    se: { x: b.x, y: b.y },
    s: { x: mx, y: b.y },
    sw: { x: a.x, y: b.y },
    w: { x: a.x, y: my },
  };
}

function contains(frame: Rect, p: Point): boolean {
  return p.x >= frame.x && p.x <= frame.x + frame.w && p.y >= frame.y && p.y <= frame.y + frame.h;
}

/** Handles of the selected frame first, then grid lines, then frames (the selected one wins an overlap). */
export function hit_test(
  view: View,
  grid: SpriteGrid,
  lines: LineRef[],
  selected: number | null,
  sx: number,
  sy: number,
  hit_tolerance = HIT_TOLERANCE
): Hit {
  const img = to_image(view, sx, sy);
  const selected_frame = selected === null ? undefined : grid.frames[selected];

  if (selected !== null && selected_frame) {
    const points = handle_points(view, selected_frame);
    for (const handle of HANDLES) {
      const p = points[handle];
      if (Math.abs(p.x - sx) <= hit_tolerance + 1 && Math.abs(p.y - sy) <= hit_tolerance + 1) {
        return { type: "handle", frame: selected, handle };
      }
    }
  }

  const tolerance = hit_tolerance / view.scale;
  const b = grid.bounds;
  const within_y = img.y >= b.y - tolerance && img.y <= b.y + b.h + tolerance;
  const within_x = img.x >= b.x - tolerance && img.x <= b.x + b.w + tolerance;

  let best: LineRef | null = null;
  let best_distance = Infinity;
  for (const line of lines) {
    if (!(line.axis === "column" ? within_y : within_x)) continue;
    const distance = Math.abs((line.axis === "column" ? img.x : img.y) - line.position);
    if (distance <= tolerance && distance < best_distance) {
      best = line;
      best_distance = distance;
    }
  }
  if (best) {
    const anchor = best;
    return {
      type: "line",
      lines: lines.filter((l) => l.axis === anchor.axis && Math.abs(l.position - anchor.position) <= 0.5),
    };
  }

  if (selected !== null && selected_frame && contains(selected_frame, img)) return { type: "frame", index: selected };
  const index = grid.frames.findIndex((frame) => contains(frame, img));
  return index >= 0 ? { type: "frame", index } : { type: "none" };
}

export function handle_cursor(handle: Handle): string {
  if (handle === "n" || handle === "s") return "ns-resize";
  if (handle === "e" || handle === "w") return "ew-resize";
  return handle === "ne" || handle === "sw" ? "nesw-resize" : "nwse-resize";
}

export function hit_cursor(hit: Hit, selected: number | null): string {
  if (hit.type === "handle") return handle_cursor(hit.handle);
  if (hit.type === "line") return hit.lines[0].axis === "column" ? "ew-resize" : "ns-resize";
  if (hit.type === "frame") return hit.index === selected ? "move" : "pointer";
  return "grab";
}

/** Position, plus the frame or line under the pointer. */
export function describe_hit(view: View, grid: SpriteGrid, sx: number, sy: number, hit: Hit): string {
  const img = to_image(view, sx, sy);
  const parts = [`${Math.floor(img.x)}, ${Math.floor(img.y)}`];
  if (hit.type === "frame" || hit.type === "handle") {
    const index = hit.type === "frame" ? hit.index : hit.frame;
    const f = grid.frames[index];
    if (f) parts.push(`#${index}  ${Math.round(f.x)},${Math.round(f.y)}  ${Math.round(f.w)}×${Math.round(f.h)}`);
  } else if (hit.type === "line") {
    const l = hit.lines[0];
    parts.push(`${l.axis} ${l.index} ${l.edge} @ ${Math.round(l.position)}`);
  }
  return parts.join("   ");
}

/** Theme tokens resolved for canvas, which can't read CSS variables. */
export interface Palette {
  line: string;
  line_override: string;
  frame_override: string;
  selected: string;
  excluded: string;
  shade: string;
  label: string;
  check_a: string;
  check_b: string;
}

/** Resolved through `probe`'s computed colour, since a token may itself be written with `var()` or relative colour syntax. */
export function read_palette(probe: HTMLElement): Palette {
  const token = (name: string) => {
    probe.style.color = `var(--${name})`;
    return getComputedStyle(probe).color;
  };
  const palette = {
    line: token("primary"),
    line_override: token("secondary"),
    frame_override: token("tertiary"),
    selected: token("foreground"),
    excluded: token("error"),
    shade: token("background-darkest"),
    label: token("background"),
    check_a: token("background-dark"),
    check_b: token("background-light"),
  };
  probe.style.color = "";
  return palette;
}

export interface Scene {
  image: CanvasImageSource;
  width: number;
  height: number;
  grid: SpriteGrid;
  lines: LineRef[];
  overrides: SpriteOverrides;
  selected: number | null;
  sequence: Set<number>;
  show_labels: boolean;
  view: View;
  hover: Hit;
  palette: Palette;
  handle_size: number;
}

function checkerboard(ctx: CanvasRenderingContext2D, palette: Palette): CanvasPattern | null {
  const size = 16;
  const tile = new OffscreenCanvas(size, size);
  const t = tile.getContext("2d");
  if (!t) return null;
  t.fillStyle = palette.check_a;
  t.fillRect(0, 0, size, size);
  t.fillStyle = palette.check_b;
  t.fillRect(0, 0, size / 2, size / 2);
  t.fillRect(size / 2, size / 2, size / 2, size / 2);
  return ctx.createPattern(tile, "repeat");
}

function with_alpha(ctx: CanvasRenderingContext2D, alpha: number, draw: () => void) {
  ctx.globalAlpha = alpha;
  draw();
  ctx.globalAlpha = 1;
}

/** The whole sheet view: image, padding and gaps, excluded frames, labels, grid lines and the selection. */
export function draw_sheet(ctx: CanvasRenderingContext2D, cw: number, ch: number, dpr: number, scene: Scene): void {
  const { image, width, height, grid, lines, overrides, selected, sequence, show_labels, view, hover, palette, handle_size } = scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, ch);

  const origin = to_screen(view, 0, 0);
  const image_w = width * view.scale;
  const image_h = height * view.scale;

  const pattern = checkerboard(ctx, palette);
  if (pattern) {
    ctx.fillStyle = pattern;
    ctx.fillRect(origin.x, origin.y, image_w, image_h);
  }

  ctx.imageSmoothingEnabled = view.scale < 1;
  ctx.drawImage(image, origin.x, origin.y, image_w, image_h);

  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.selected;
  with_alpha(ctx, 0.4, () =>
    ctx.strokeRect(Math.round(origin.x) + 0.5, Math.round(origin.y) + 0.5, Math.round(image_w), Math.round(image_h))
  );

  const b = grid.bounds;
  const ba = to_screen(view, b.x, b.y);
  const bb = to_screen(view, b.x + b.w, b.y + b.h);
  ctx.fillStyle = palette.shade;
  with_alpha(ctx, 0.55, () => {
    ctx.beginPath();
    ctx.rect(origin.x, origin.y, image_w, image_h);
    ctx.rect(ba.x, ba.y, bb.x - ba.x, bb.y - ba.y);
    ctx.fill("evenodd");
  });

  ctx.fillStyle = palette.excluded;
  with_alpha(ctx, 0.18, () => {
    for (let i = 1; i < grid.columns.length; i++) {
      const prev = grid.columns[i - 1].end;
      const next = grid.columns[i].start;
      if (next <= prev) continue;
      const a = to_screen(view, prev, b.y);
      const c = to_screen(view, next, b.y + b.h);
      ctx.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
    }
    for (let i = 1; i < grid.rows.length; i++) {
      const prev = grid.rows[i - 1].end;
      const next = grid.rows[i].start;
      if (next <= prev) continue;
      const a = to_screen(view, b.x, prev);
      const c = to_screen(view, b.x + b.w, next);
      ctx.fillRect(a.x, a.y, c.x - a.x, c.y - a.y);
    }
  });

  ctx.font = "11px Hack, monospace";
  ctx.textBaseline = "top";
  grid.frames.forEach((f, index) => {
    const a = to_screen(view, f.x, f.y);
    const c = to_screen(view, f.x + f.w, f.y + f.h);
    const w = c.x - a.x;
    const h = c.y - a.y;
    const included = sequence.has(index);

    if (!included) {
      ctx.fillStyle = palette.excluded;
      ctx.strokeStyle = palette.excluded;
      with_alpha(ctx, 0.35, () => ctx.fillRect(a.x, a.y, w, h));
      with_alpha(ctx, 0.6, () => {
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(c.x, c.y);
        ctx.moveTo(c.x, a.y);
        ctx.lineTo(a.x, c.y);
        ctx.stroke();
      });
    }

    if (hover.type === "frame" && hover.index === index && index !== selected) {
      ctx.fillStyle = palette.selected;
      with_alpha(ctx, 0.12, () => ctx.fillRect(a.x, a.y, w, h));
    }

    if (overrides.frames[index]) {
      ctx.strokeStyle = palette.frame_override;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(w), Math.round(h));
    }

    if (show_labels && w > 18 && h > 14) {
      const text = String(index);
      ctx.fillStyle = palette.label;
      with_alpha(ctx, 0.75, () => ctx.fillRect(a.x + 1, a.y + 1, ctx.measureText(text).width + 6, 14));
      ctx.fillStyle = included ? palette.line : palette.excluded;
      ctx.fillText(text, a.x + 4, a.y + 2);
    }
  });

  const hovered = hover.type === "line" ? hover.lines : [];
  for (const line of lines) {
    const is_hovered = hovered.some((l) => l.axis === line.axis && l.index === line.index && l.edge === line.edge);
    ctx.strokeStyle = is_line_overridden(overrides, line) ? palette.line_override : palette.line;
    ctx.lineWidth = is_hovered ? 3 : 1;
    with_alpha(ctx, is_hovered ? 1 : 0.9, () => {
      ctx.beginPath();
      if (line.axis === "column") {
        const x = Math.round(to_screen(view, line.position, 0).x) + 0.5;
        ctx.moveTo(x, ba.y);
        ctx.lineTo(x, bb.y);
      } else {
        const y = Math.round(to_screen(view, 0, line.position).y) + 0.5;
        ctx.moveTo(ba.x, y);
        ctx.lineTo(bb.x, y);
      }
      ctx.stroke();
    });
  }

  const frame = selected === null ? undefined : grid.frames[selected];
  if (frame) {
    const a = to_screen(view, frame.x, frame.y);
    const c = to_screen(view, frame.x + frame.w, frame.y + frame.h);
    ctx.strokeStyle = palette.selected;
    ctx.lineWidth = 2;
    ctx.strokeRect(Math.round(a.x) + 0.5, Math.round(a.y) + 0.5, Math.round(c.x - a.x), Math.round(c.y - a.y));

    ctx.fillStyle = palette.selected;
    ctx.strokeStyle = palette.label;
    ctx.lineWidth = 1;
    for (const p of Object.values(handle_points(view, frame))) {
      ctx.fillRect(p.x - handle_size / 2, p.y - handle_size / 2, handle_size, handle_size);
      ctx.strokeRect(p.x - handle_size / 2 + 0.5, p.y - handle_size / 2 + 0.5, handle_size - 1, handle_size - 1);
    }
  }
}
