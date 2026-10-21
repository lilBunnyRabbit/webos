export interface Point {
  x: number;
  y: number;
}

export type Stroke = Point[];

// Strokes live in board units, so a resized window keeps the drawing and the line width.
export const BOARD = 1000;
export const LINE = 12;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapshotFrame {
  box: Box;
  scale: number;
  width: number;
  height: number;
  line: number;
}

export interface SnapshotSize {
  min: number;
  max: number;
}

export const GUESS_SIZE: SnapshotSize = { min: 384, max: 512 };
export const SAVE_SIZE: SnapshotSize = { min: 1024, max: 1024 };

export function ink_bounds(strokes: readonly Stroke[], line = LINE): Box | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const stroke of strokes)
    for (const { x, y } of stroke) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  if (left === Infinity) return null;
  const half = line / 2;
  return { x: left - half, y: top - half, width: right - left + line, height: bottom - top + line };
}

export function snapshot_frame(strokes: readonly Stroke[], size: SnapshotSize, line = LINE): SnapshotFrame | null {
  const ink = ink_bounds(strokes, line);
  if (!ink) return null;
  const pad = Math.max(line, 0.1 * Math.max(ink.width, ink.height));
  const box = { x: ink.x - pad, y: ink.y - pad, width: ink.width + 2 * pad, height: ink.height + 2 * pad };
  const longest = Math.max(box.width, box.height);
  const scale = Math.min(size.max, Math.max(size.min, longest)) / longest;
  // A tiny doodle blown up keeps a pencil line rather than a marker one, so the model still reads it as a sketch.
  const target = Math.max(box.width, box.height) * scale;
  const thinnest = target * 0.006;
  const thickest = target * 0.025;
  return {
    box,
    scale,
    width: Math.max(1, Math.round(box.width * scale)),
    height: Math.max(1, Math.round(box.height * scale)),
    line: Math.min(thickest, Math.max(thinnest, line * scale)),
  };
}

export function to_board(client: Point, rect: Box): Point {
  const clamp = (value: number) => Math.min(BOARD, Math.max(0, value));
  return {
    x: clamp(((client.x - rect.x) / rect.width) * BOARD),
    y: clamp(((client.y - rect.y) / rect.height) * BOARD),
  };
}
