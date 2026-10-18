import { canvas_to_blob } from "$kit/utils/image";

export const SplitDirection = { COLUMNS: "x", ROWS: "y" } as const;
export type SplitDirection = (typeof SplitDirection)[keyof typeof SplitDirection];

export const MAX_COUNT = 300;

export interface SplitSettings {
  direction: SplitDirection;
  /** Tiles along `direction`; the other axis gets as many as the square tiles need. */
  count: number;
}

export interface SplitLayout {
  columns: number;
  rows: number;
  /** Source edge of one square tile in image pixels. Fractional when the image doesn't divide evenly. */
  size: number;
  /** Output edge in pixels. */
  tile: number;
  /** Preview-only spacing between tiles. */
  gap: number;
}

export function clamp_count(count: number): number {
  return Number.isFinite(count) ? Math.min(MAX_COUNT, Math.max(1, Math.floor(count))) : 1;
}

export function compute_layout(width: number, height: number, settings: SplitSettings): SplitLayout {
  const count = clamp_count(settings.count);
  let columns: number;
  let rows: number;
  let size: number;

  if (settings.direction === SplitDirection.COLUMNS) {
    columns = count;
    size = width / columns;
    rows = Math.ceil(height / size);
  } else {
    rows = count;
    size = height / rows;
    columns = Math.ceil(width / size);
  }

  return { columns, rows, size, tile: Math.max(1, Math.round(size)), gap: Math.min(15, Math.max(5, size / 10)) };
}

/** Tiles with the preview gap between them. A partial last row or column leaves empty space, like the export. */
export function draw_preview(canvas: HTMLCanvasElement, image: ImageBitmap, layout: SplitLayout): void {
  const { columns, rows, size, gap } = layout;
  canvas.width = Math.max(1, Math.round(columns * size + (columns - 1) * gap));
  canvas.height = Math.max(1, Math.round(rows * size + (rows - 1) * gap));
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      ctx.drawImage(image, c * size, r * size, size, size, c * (size + gap), r * (size + gap), size, size);
    }
  }
}

export interface Tile {
  /** 1-based, row-major. */
  number: number;
  blob: Blob;
}

/** Renders tiles one at a time on a single canvas, so memory stays at one tile however many there are. */
export async function* render_tiles(image: ImageBitmap, layout: SplitLayout): AsyncGenerator<Tile> {
  const canvas = document.createElement("canvas");
  canvas.width = layout.tile;
  canvas.height = layout.tile;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't create a canvas");

  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.columns; c++) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image, c * layout.size, r * layout.size, layout.size, layout.size, 0, 0, layout.tile, layout.tile);
      yield { number: r * layout.columns + c + 1, blob: await canvas_to_blob(canvas) };
    }
  }
}
