import { fill_base, overlay_marks, text_box, type Mark, type TestFormat, type TestImageSpec, type Tile } from "./test-image";

type Context2d = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

const FONT = "ui-monospace, Menlo, Consolas, monospace";
const TILE_WIDTH = 4096;
const BAND_BYTES = 32 * 1024 * 1024;
const MAX_BAND_ROWS = 2048;

function draw_marks(context: Context2d, marks: Mark[], tile: Tile): void {
  context.save();
  context.setTransform(tile.scale, 0, 0, tile.scale, -tile.x * tile.scale, -tile.y * tile.scale);
  for (const mark of marks) {
    if (mark.kind === "rect") {
      context.fillStyle = mark.color;
      context.fillRect(mark.x, mark.y, mark.width, mark.height);
      continue;
    }
    const box = text_box(mark);
    if (mark.plate) {
      context.fillStyle = mark.plate;
      context.beginPath();
      context.roundRect(box.x, box.y, box.width, box.height, mark.size * 0.2);
      context.fill();
    }
    context.font = `600 ${mark.size}px ${FONT}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = mark.color;
    context.fillText(mark.text, box.x + box.width / 2, box.y + box.height / 2, box.width);
  }
  context.restore();
}

export function render_tile(context: Context2d, spec: TestImageSpec, tile: Tile, format: TestFormat): void {
  const image = context.createImageData(tile.columns, tile.rows);
  fill_base(new Uint32Array(image.data.buffer), spec, tile);
  context.putImageData(image, 0, 0);
  const view = { x: tile.x, y: tile.y, width: tile.columns / tile.scale, height: tile.rows / tile.scale };
  const marks = overlay_marks(spec, view, format);
  if (marks.length) draw_marks(context, marks, tile);
}

export function render_canvas(spec: TestImageSpec, format: TestFormat, scale = 1): OffscreenCanvas {
  const columns = Math.max(1, Math.round(spec.width * scale));
  const rows = Math.max(1, Math.round(spec.height * scale));
  const canvas = new OffscreenCanvas(columns, rows);
  render_tile(canvas.getContext("2d")!, spec, { x: 0, y: 0, columns, rows, scale: columns / spec.width }, format);
  return canvas;
}

export function band_rows(width: number, height: number): number {
  return Math.max(1, Math.min(height, MAX_BAND_ROWS, Math.floor(BAND_BYTES / (width * 3))));
}

export interface BandOptions {
  signal: AbortSignal;
  pace: () => Promise<void>;
}

// Tiles no wider than 4096 px, so neither side of the image is bound by canvas limits.
export async function* render_bands(
  spec: TestImageSpec,
  format: TestFormat,
  { signal, pace }: BandOptions
): AsyncGenerator<{ rgb: Uint8Array; rows: number }> {
  const { width, height } = spec;
  const rows_per_band = band_rows(width, height);
  const tile_width = Math.min(width, TILE_WIDTH);
  const canvas = new OffscreenCanvas(tile_width, rows_per_band);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  let image = null as ImageData | null;
  for (let y = 0; y < height; y += rows_per_band) {
    signal.throwIfAborted();
    const rows = Math.min(rows_per_band, height - y);
    const rgb = new Uint8Array(rows * width * 3);
    for (let x = 0; x < width; x += tile_width) {
      const columns = Math.min(tile_width, width - x);
      const tile = { x, y, columns, rows, scale: 1 };
      if (image?.width !== columns || image.height !== rows) image = new ImageData(columns, rows);
      fill_base(new Uint32Array(image.data.buffer), spec, tile);
      let rgba = image.data;
      const marks = overlay_marks(spec, { x, y, width: columns, height: rows }, format);
      if (marks.length) {
        context.putImageData(image, 0, 0);
        draw_marks(context, marks, tile);
        rgba = context.getImageData(0, 0, columns, rows).data;
      }
      for (let j = 0; j < rows; j++) {
        let source = j * columns * 4;
        let target = (j * width + x) * 3;
        for (let i = 0; i < columns; i++, source += 4, target += 3) {
          rgb[target] = rgba[source];
          rgb[target + 1] = rgba[source + 1];
          rgb[target + 2] = rgba[source + 2];
        }
      }
      await pace();
    }
    yield { rgb, rows };
  }
}
