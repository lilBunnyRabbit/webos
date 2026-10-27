import { page_size, warp, type Quad } from "$kit/utils/perspective";

/** Longer side of what a reader gets: handwriting on a phone photo stays legible, and a 12 MP decode stays out of the models. */
export const MAX_SIDE = 2000;

/** Upright by the photo's orientation tag, so the crop and the reader see it the way the camera app shows it. */
export function upright(image: Blob): Promise<ImageBitmap> {
  return createImageBitmap(image, { imageOrientation: "from-image" });
}

// A list photographed at an angle reads better pulled flat: on a synthetic list turned and skewed, 5 of 10 items read
// as photographed and 10 of 10 straightened (docs/apps/shopping-list.md).
function straightened(bitmap: ImageBitmap, quad: Quad): OffscreenCanvas {
  const size = page_size(quad, MAX_SIDE);
  const natural = page_size(quad);
  const scale = Math.min(1, (size.width / natural.width) * 1.25);
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const source = new OffscreenCanvas(width, height);
  const context = source.getContext("2d", { willReadFrequently: true })!;
  context.drawImage(bitmap, 0, 0, width, height);
  const scaled = quad.map((corner) => ({ x: corner.x * scale, y: corner.y * scale })) as Quad;
  const flat = warp(context.getImageData(0, 0, width, height), scaled, size);
  const out = new OffscreenCanvas(size.width, size.height);
  out.getContext("2d")!.putImageData(new ImageData(flat.data as Uint8ClampedArray<ArrayBuffer>, size.width, size.height), 0, 0);
  return out;
}

/** The page inside `crop` (bitmap pixels, `null` for all) pulled flat, turned clockwise by `turn` degrees, at most `MAX_SIDE` long. */
export function draw(bitmap: ImageBitmap, crop: Quad | null, turn = 0): OffscreenCanvas {
  const picture = crop ? straightened(bitmap, crop) : bitmap;
  const scale = Math.min(1, MAX_SIDE / Math.max(picture.width, picture.height));
  const width = Math.max(1, Math.round(picture.width * scale));
  const height = Math.max(1, Math.round(picture.height * scale));
  const sideways = turn % 180 !== 0;
  const canvas = new OffscreenCanvas(sideways ? height : width, sideways ? width : height);
  const context = canvas.getContext("2d")!;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turn * Math.PI) / 180);
  context.drawImage(picture, -width / 2, -height / 2, width, height);
  return canvas;
}

export function render(bitmap: ImageBitmap, crop: Quad | null): Promise<Blob> {
  return draw(bitmap, crop).convertToBlob({ type: "image/png" });
}
