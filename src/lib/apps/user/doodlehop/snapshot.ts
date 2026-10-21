import { LINE, snapshot_frame, type Point, type SnapshotSize, type Stroke } from "./ink";

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function trace(ctx: Context, stroke: Stroke): void {
  const [first, ...rest] = stroke;
  if (!first) return;
  ctx.beginPath();
  ctx.moveTo(first.x, first.y);
  // A tap is one point; a zero-length line with round caps draws it as a dot.
  if (rest.length === 0) ctx.lineTo(first.x + 0.01, first.y);
  for (const point of rest) ctx.lineTo(point.x, point.y);
  ctx.stroke();
}

export function segment(ctx: Context, from: Point, to: Point): void {
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x === from.x && to.y === from.y ? to.x + 0.01 : to.x, to.y);
  ctx.stroke();
}

export function draw_strokes(
  ctx: Context,
  strokes: readonly Stroke[],
  scale: number,
  color: string,
  line = LINE
): void {
  ctx.save();
  ctx.scale(scale, scale);
  ctx.strokeStyle = color;
  ctx.lineWidth = line;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) trace(ctx, stroke);
  ctx.restore();
}

// The model sees what Quick, Draw! players draw: black lines on white, whatever the theme.
export function render_snapshot(strokes: readonly Stroke[], size: SnapshotSize): OffscreenCanvas | null {
  const frame = snapshot_frame(strokes, size);
  if (!frame) return null;
  const canvas = new OffscreenCanvas(frame.width, frame.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, frame.width, frame.height);
  ctx.scale(frame.scale, frame.scale);
  ctx.translate(-frame.box.x, -frame.box.y);
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = frame.line / frame.scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) trace(ctx, stroke);
  return canvas;
}

export async function snapshot_png(strokes: readonly Stroke[], size: SnapshotSize): Promise<Blob | null> {
  const canvas = render_snapshot(strokes, size);
  return canvas ? canvas.convertToBlob({ type: "image/png" }) : null;
}
