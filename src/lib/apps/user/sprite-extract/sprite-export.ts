import { canvas_to_blob } from "$lib/core/utils/image";
import { frame_size, round_rect, type Rect } from "./sprite-model";

export const Anchor = {
  CENTER: "center",
  BOTTOM: "bottom",
  TOP: "top",
  LEFT: "left",
  RIGHT: "right",
  TOP_LEFT: "top-left",
  TOP_RIGHT: "top-right",
  BOTTOM_LEFT: "bottom-left",
  BOTTOM_RIGHT: "bottom-right",
} as const;
export type Anchor = (typeof Anchor)[keyof typeof Anchor];

export const ANCHORS: { value: Anchor; label: string }[] = [
  { value: Anchor.CENTER, label: "Center" },
  { value: Anchor.BOTTOM, label: "Bottom" },
  { value: Anchor.TOP, label: "Top" },
  { value: Anchor.LEFT, label: "Left" },
  { value: Anchor.RIGHT, label: "Right" },
  { value: Anchor.TOP_LEFT, label: "Top left" },
  { value: Anchor.TOP_RIGHT, label: "Top right" },
  { value: Anchor.BOTTOM_LEFT, label: "Bottom left" },
  { value: Anchor.BOTTOM_RIGHT, label: "Bottom right" },
];

interface Size {
  w: number;
  h: number;
}

/** Where a `frame` sits inside a `cell` for the given anchor. */
export function anchor_offset(frame: Size, cell: Size, anchor: Anchor): { x: number; y: number } {
  const dx = cell.w - frame.w;
  const dy = cell.h - frame.h;
  const x = anchor.includes("left") ? 0 : anchor.includes("right") ? dx : dx / 2;
  const y = anchor.includes("top") ? 0 : anchor.includes("bottom") ? dy : dy / 2;
  return { x: Math.round(x), y: Math.round(y) };
}

export interface ExportOptions {
  /** Source file name, recorded in the metadata. */
  source: string;
  /** Pad every frame to the largest one. */
  uniform: boolean;
  anchor: Anchor;
  /** Columns of the repacked sheet. */
  sheet_columns: number;
  fps: number;
}

function draw_frame(ctx: CanvasRenderingContext2D, image: CanvasImageSource, frame: Rect, dest: Rect, anchor: Anchor) {
  const src = round_rect(frame);
  const offset = anchor_offset(src, dest, anchor);
  ctx.drawImage(image, src.x, src.y, src.w, src.h, dest.x + offset.x, dest.y + offset.y, src.w, src.h);
}

function metadata(frames: Rect[], sequence: number[], cell: Size | null, options: ExportOptions) {
  return {
    source: options.source,
    fps: options.fps,
    anchor: options.anchor,
    frame_size: cell,
    frames: sequence.map((index, order) => ({ order, index, source: round_rect(frames[index]) })),
  };
}

export interface ExportedFrame {
  /** Position in the sequence, 0-based. */
  order: number;
  blob: Blob;
}

/** One PNG per sequence entry, rendered one at a time on a single canvas. */
export async function* render_frames(
  image: CanvasImageSource,
  frames: Rect[],
  sequence: number[],
  options: ExportOptions
): AsyncGenerator<ExportedFrame> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't create a canvas");
  const cell = options.uniform ? frame_size(frames, sequence) : null;

  for (let order = 0; order < sequence.length; order++) {
    const frame = round_rect(frames[sequence[order]]);
    const size = cell ?? frame;
    canvas.width = Math.max(1, size.w);
    canvas.height = Math.max(1, size.h);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw_frame(ctx, image, frame, { x: 0, y: 0, w: canvas.width, h: canvas.height }, options.anchor);
    yield { order, blob: await canvas_to_blob(canvas) };
  }
}

export function frame_file_name(stem: string, order: number, count: number): string {
  const digits = Math.max(2, String(count - 1).length);
  return `${stem}_${String(order).padStart(digits, "0")}.png`;
}

export function frames_metadata(frames: Rect[], sequence: number[], options: ExportOptions): string {
  const cell = options.uniform ? frame_size(frames, sequence) : null;
  return JSON.stringify(metadata(frames, sequence, cell, options), null, 2);
}

/** The sequence repacked into an even grid, plus its metadata. */
export async function render_sheet(
  image: CanvasImageSource,
  frames: Rect[],
  sequence: number[],
  options: ExportOptions
): Promise<{ png: Blob; json: string }> {
  const cell = frame_size(frames, sequence);
  const columns = Math.max(1, Math.min(options.sheet_columns || sequence.length, sequence.length));
  const rows = Math.ceil(sequence.length / columns);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, cell.w * columns);
  canvas.height = Math.max(1, cell.h * rows);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't create a canvas");

  sequence.forEach((index, i) => {
    const dest = { x: (i % columns) * cell.w, y: Math.floor(i / columns) * cell.h, w: cell.w, h: cell.h };
    draw_frame(ctx, image, frames[index], dest, options.anchor);
  });

  const meta = {
    ...metadata(frames, sequence, cell, options),
    sheet: { columns, rows, width: canvas.width, height: canvas.height },
  };
  return { png: await canvas_to_blob(canvas), json: JSON.stringify(meta, null, 2) };
}
