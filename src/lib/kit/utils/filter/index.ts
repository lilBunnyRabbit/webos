import { apply_filter_steps, filter_css, type FilterStep } from "./math";

export * from "./math";

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface FilterRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

let works: boolean | null = null;

// Safari has `filter` on the 2D context but ignores it, so only drawing through it tells.
export function canvas_filter_works(): boolean {
  if (works !== null) return works;
  const context = new OffscreenCanvas(1, 1).getContext("2d", { willReadFrequently: true });
  if (!context) return (works = false);
  context.filter = "brightness(0%)";
  context.fillStyle = "#fff";
  context.fillRect(0, 0, 1, 1);
  return (works = context.getImageData(0, 0, 1, 1).data[0] < 128);
}

/**
 * Runs `draw` on `context` through the CSS filter `steps`. Where the canvas ignores `filter`, `draw` paints a scratch
 * layer instead, whose pixels are filtered by hand and composited back with the context's own state. `region` (canvas
 * pixels) bounds that work; the blur spread it needs is the caller's margin.
 */
export function draw_filtered(context: Context2D, steps: readonly FilterStep[], draw: (target: Context2D) => void, region?: FilterRegion): void {
  if (steps.length === 0) return draw(context);
  if (canvas_filter_works()) {
    const previous = context.filter;
    context.filter = filter_css(steps);
    draw(context);
    context.filter = previous;
    return;
  }
  const area = region ?? { x: 0, y: 0, width: context.canvas.width, height: context.canvas.height };
  if (area.width <= 0 || area.height <= 0) return;
  const layer = new OffscreenCanvas(area.width, area.height);
  const layer_context = layer.getContext("2d", { willReadFrequently: true })!;
  layer_context.imageSmoothingEnabled = context.imageSmoothingEnabled;
  layer_context.imageSmoothingQuality = context.imageSmoothingQuality;
  layer_context.translate(-area.x, -area.y);
  layer_context.transform(...matrix_of(context.getTransform()));
  draw(layer_context);
  const pixels = layer_context.getImageData(0, 0, area.width, area.height);
  apply_filter_steps(pixels, steps);
  layer_context.putImageData(pixels, 0, 0);
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(layer, area.x, area.y);
  context.restore();
}

function matrix_of(matrix: DOMMatrix): [number, number, number, number, number, number] {
  return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
}
