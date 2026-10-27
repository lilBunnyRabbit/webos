import { find_paper, page_size, to_gray, warp, type Quad } from "$kit/utils/perspective";
import { serve } from "$kit/utils/worker/serve";
import type { Input } from "$kit/utils/worker";
import { apply_filter, PageFilter } from "./warp";

export interface Detected {
  width: number;
  height: number;
  quad: Quad | null;
}

export interface Straightened {
  blob: Blob;
  width: number;
  height: number;
}

export interface ScanApi {
  detect(source: Blob): Detected;
  straighten(input: { source: Blob; quad: Quad; filter: PageFilter; max_side: number }): Straightened;
}

const DETECT_SIDE = 480;
const JPEG_QUALITY = 0.88;
/** A little more source than output, so the warp's bilinear sampling never skips pixels. */
const OVERSAMPLE = 1.25;

function upright(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source, { imageOrientation: "from-image" }).catch(() => {
    throw new Error("The picture couldn't be read");
  });
}

function pixels(bitmap: ImageBitmap, scale: number): ImageData {
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function detect(source: Blob): Promise<Detected> {
  const bitmap = await upright(source);
  try {
    const scale = Math.min(1, DETECT_SIDE / Math.max(bitmap.width, bitmap.height));
    const image = pixels(bitmap, scale);
    const found = find_paper(to_gray(image.data, image.width, image.height));
    const quad = found && (found.map((corner) => ({ x: corner.x / scale, y: corner.y / scale })) as Quad);
    return { width: bitmap.width, height: bitmap.height, quad };
  } finally {
    bitmap.close();
  }
}

async function straighten({ source, quad, filter, max_side }: Input<ScanApi["straighten"]>): Promise<Straightened> {
  const bitmap = await upright(source);
  try {
    const natural = page_size(quad, Infinity);
    const size = page_size(quad, max_side);
    const scale = Math.min(1, (size.width / natural.width) * OVERSAMPLE);
    const image = pixels(bitmap, scale);
    const scaled = quad.map((corner) => ({ x: corner.x * scale, y: corner.y * scale })) as Quad;
    const flat = apply_filter(warp(image, scaled, size), filter);
    const canvas = new OffscreenCanvas(size.width, size.height);
    canvas.getContext("2d")!.putImageData(new ImageData(flat.data as Uint8ClampedArray<ArrayBuffer>, size.width, size.height), 0, 0);
    const blob = await canvas.convertToBlob(filter === PageFilter.BW ? { type: "image/png" } : { type: "image/jpeg", quality: JPEG_QUALITY });
    return { blob, ...size };
  } finally {
    bitmap.close();
  }
}

serve<ScanApi>({ detect, straighten });
