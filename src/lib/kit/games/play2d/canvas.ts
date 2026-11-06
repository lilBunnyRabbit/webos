import type { Polygon } from "./geometry";
import type { Palette } from "./palette";

export interface View {
  x: number;
  y: number;
  /** CSS pixels per metre. */
  scale: number;
  width: number;
  height: number;
  dpr: number;
}

export function trace(ctx: CanvasRenderingContext2D, shape: Polygon) {
  shape.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

export function path(ctx: CanvasRenderingContext2D, shape: Polygon) {
  ctx.beginPath();
  trace(ctx, shape);
}

export function fill(ctx: CanvasRenderingContext2D, shape: Polygon, colour: string) {
  path(ctx, shape);
  ctx.fillStyle = colour;
  ctx.fill();
}

export function begin_frame(ctx: CanvasRenderingContext2D, view: View, palette: Palette) {
  const { width, height, dpr, scale } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette.void;
  ctx.fillRect(0, 0, width * dpr, height * dpr);
  // Not snapped to whole pixels: the car moves continuously, so a snapped camera makes it jitter a pixel against the world.
  ctx.setTransform(
    dpr * scale,
    0,
    0,
    dpr * scale,
    dpr * (width / 2 - view.x * scale),
    dpr * (height / 2 - view.y * scale)
  );
}
