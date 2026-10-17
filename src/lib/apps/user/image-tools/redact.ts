import { RestoreMode, draw_ops, ops_bounds, rect_at, type Pixels, type Rect, type RestoreOp } from "./patch";

export const Effect = { BOX: "box", PIXELATE: "pixelate", BLUR: "blur" } as const;
export type Effect = (typeof Effect)[keyof typeof Effect];

/** Smaller blocks and lighter blur can be undone or read through, so these are floors no setting goes below. */
export const MIN_BLOCK = 12;
export const MIN_BLUR = 20;

export interface RedactArea {
  effect: Effect;
  op: RestoreOp;
}

export interface RedactOptions {
  source: ImageBitmap | OffscreenCanvas;
  areas: RedactArea[];
  block: number;
  radius: number;
  scale?: number;
}

/** Box goes last, so a solid area stays solid wherever it overlaps another. */
const ORDER = [Effect.PIXELATE, Effect.BLUR, Effect.BOX];
const BLUR_PASSES = 3;

export function pixelate({ data, width, height }: Pixels, block: number, origin_x = 0, origin_y = 0): void {
  const size = Math.max(1, Math.round(block));
  const start_x = -(((origin_x % size) + size) % size);
  const start_y = -(((origin_y % size) + size) % size);
  const sum = [0, 0, 0, 0];
  for (let top = start_y; top < height; top += size) {
    const y0 = Math.max(0, top);
    const y1 = Math.min(height, top + size);
    for (let left = start_x; left < width; left += size) {
      const x0 = Math.max(0, left);
      const x1 = Math.min(width, left + size);
      sum.fill(0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * width + x) * 4;
          for (let c = 0; c < 4; c++) sum[c] += data[p + c];
        }
      }
      const count = (x1 - x0) * (y1 - y0);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * width + x) * 4;
          for (let c = 0; c < 4; c++) data[p + c] = sum[c] / count;
        }
      }
    }
  }
}

/** Edges repeat outward instead of fading to transparent. */
export function blur({ data, width, height }: Pixels, radius: number): void {
  const r = Math.max(1, Math.round(radius));
  let from = Float32Array.from(data);
  let to = new Float32Array(data.length);
  for (let pass = 0; pass < BLUR_PASSES; pass++) {
    blur_lines(from, to, width, height, 4, width * 4, r);
    [from, to] = [to, from];
    blur_lines(from, to, height, width, width * 4, 4, r);
    [from, to] = [to, from];
  }
  data.set(from);
}

function blur_lines(
  from: Float32Array,
  to: Float32Array,
  length: number,
  count: number,
  step: number,
  stride: number,
  r: number
): void {
  const norm = 1 / (2 * r + 1);
  const last = length - 1;
  for (let line = 0; line < count; line++) {
    for (let c = 0; c < 4; c++) {
      const offset = line * stride + c;
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += from[offset + Math.min(last, Math.max(0, i)) * step];
      for (let i = 0; i < length; i++) {
        to[offset + i * step] = sum * norm;
        sum += from[offset + Math.min(last, i + r + 1) * step] - from[offset + Math.max(0, i - r) * step];
      }
    }
  }
}

export function area_bounds(area: RedactArea): Rect | null {
  return ops_bounds([area.op]);
}

export function area_at(areas: RedactArea[], x: number, y: number, reach = 0): number | null {
  const boxes = areas.flatMap((area, index) => {
    const bounds = area_bounds(area);
    if (!bounds) return [];
    return [
      {
        x: bounds.x - reach,
        y: bounds.y - reach,
        width: bounds.width + reach * 2,
        height: bounds.height + reach * 2,
        index,
      },
    ];
  });
  return rect_at(boxes, x, y)?.index ?? null;
}

export function redact({ source, areas, block, radius, scale = 1 }: RedactOptions): OffscreenCanvas {
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const out = new OffscreenCanvas(width, height);
  const context = out.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(source, 0, 0, width, height);

  for (const effect of ORDER) {
    const ops = areas
      .filter((area) => area.effect === effect || area.op.mode === RestoreMode.ERASE)
      .map((area) => area.op);
    const bounds = ops_bounds(ops);
    if (!bounds) continue;

    const mask = new OffscreenCanvas(width, height);
    const mask_context = mask.getContext("2d")!;
    mask_context.fillStyle = "#000";
    draw_ops(mask_context, ops, scale);
    if (effect === Effect.BOX) {
      context.drawImage(mask, 0, 0);
      continue;
    }

    const block_px = Math.max(MIN_BLOCK, block) * scale;
    const radius_px = Math.max(MIN_BLUR, radius) * scale;
    const margin = Math.ceil(effect === Effect.BLUR ? radius_px * BLUR_PASSES : block_px) + 1;
    const left = Math.max(0, Math.floor(bounds.x * scale) - margin);
    const top = Math.max(0, Math.floor(bounds.y * scale) - margin);
    const right = Math.min(width, Math.ceil((bounds.x + bounds.width) * scale) + margin);
    const bottom = Math.min(height, Math.ceil((bounds.y + bounds.height) * scale) + margin);
    if (right <= left || bottom <= top) continue;

    const pixels = context.getImageData(left, top, right - left, bottom - top);
    if (effect === Effect.PIXELATE) pixelate(pixels, block_px, left, top);
    else blur(pixels, radius_px);

    const layer = new OffscreenCanvas(right - left, bottom - top);
    const layer_context = layer.getContext("2d")!;
    layer_context.putImageData(pixels, 0, 0);
    layer_context.globalCompositeOperation = "destination-in";
    layer_context.drawImage(mask, -left, -top);
    // Cleared first: on a see-through image the original would show through a softened layer laid over it.
    context.globalCompositeOperation = "destination-out";
    context.drawImage(mask, 0, 0);
    context.globalCompositeOperation = "source-over";
    context.drawImage(layer, left, top);
  }
  return out;
}
