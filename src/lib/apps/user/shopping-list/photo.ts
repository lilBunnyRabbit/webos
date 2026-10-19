import type { Bounds } from "$lib/core/utils/type";

/** Longer side of what a reader gets: handwriting on a phone photo stays legible, and a 12 MP decode stays out of the models. */
export const MAX_SIDE = 2000;

/** Upright by the photo's orientation tag, so the crop and the reader see it the way the camera app shows it. */
export function upright(image: Blob): Promise<ImageBitmap> {
  return createImageBitmap(image, { imageOrientation: "from-image" });
}

/** The part in `crop` (bitmap pixels; `null` for all), turned clockwise by `turn` degrees, at most `MAX_SIDE` long. */
export function draw(bitmap: ImageBitmap, crop: Bounds | null, turn = 0): OffscreenCanvas {
  const area = crop ?? { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const scale = Math.min(1, MAX_SIDE / Math.max(area.width, area.height));
  const width = Math.max(1, Math.round(area.width * scale));
  const height = Math.max(1, Math.round(area.height * scale));
  const sideways = turn % 180 !== 0;
  const canvas = new OffscreenCanvas(sideways ? height : width, sideways ? width : height);
  const context = canvas.getContext("2d")!;
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turn * Math.PI) / 180);
  context.drawImage(bitmap, area.x, area.y, area.width, area.height, -width / 2, -height / 2, width, height);
  return canvas;
}

export function render(bitmap: ImageBitmap, crop: Bounds | null): Promise<Blob> {
  return draw(bitmap, crop).convertToBlob({ type: "image/png" });
}
