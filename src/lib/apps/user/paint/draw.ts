import { ellipse_in, line_points, rect_from, snap_line, type Point } from "./shapes";
import { FillMode, Tool } from "./tools";

type Context = CanvasRenderingContext2D;

export interface ShapeStyle {
  size: number;
  stroke: string;
  fill: string;
  mode: FillMode;
}

export function stamp_pencil(context: Context, from: Point, to: Point, size: number, color: string): void {
  const offset = Math.floor(size / 2);
  context.fillStyle = color;
  for (const point of line_points(from, to)) context.fillRect(point.x - offset, point.y - offset, size, size);
}

export function stroke_brush(context: Context, from: Point, to: Point, width: number, color: string, erase: boolean): void {
  context.save();
  context.globalCompositeOperation = erase ? "destination-out" : "source-over";
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = width;
  if (from.x === to.x && from.y === to.y) {
    context.beginPath();
    context.arc(to.x, to.y, width / 2, 0, Math.PI * 2);
    context.fill();
  } else {
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }
  context.restore();
}

// Odd stroke widths centred on a pixel boundary blur across two pixels; the half-pixel shift keeps them crisp.
function crisp(point: Point, size: number): Point {
  const shift = size % 2 === 1 ? 0.5 : 0;
  return { x: Math.floor(point.x) + shift, y: Math.floor(point.y) + shift };
}

export function draw_shape(context: Context, tool: Tool, from: Point, to: Point, constrain: boolean, style: ShapeStyle): void {
  const a = crisp(from, style.size);
  const b = crisp(to, style.size);
  context.save();
  context.lineWidth = style.size;
  context.strokeStyle = style.stroke;
  context.fillStyle = style.mode === FillMode.BOTH ? style.fill : style.stroke;
  context.lineCap = "round";
  context.lineJoin = tool === Tool.RECTANGLE ? "miter" : "round";
  context.beginPath();

  if (tool === Tool.LINE) {
    const end = constrain ? snap_line(a, b) : b;
    context.moveTo(a.x, a.y);
    context.lineTo(end.x, end.y);
    context.stroke();
    context.restore();
    return;
  }

  const rect = rect_from(a, b, constrain);
  if (tool === Tool.RECTANGLE) {
    context.rect(rect.x, rect.y, rect.width, rect.height);
  } else {
    const { cx, cy, rx, ry } = ellipse_in(rect);
    context.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  if (style.mode !== FillMode.OUTLINE) context.fill();
  if (style.mode !== FillMode.FILL) context.stroke();
  context.restore();
}
