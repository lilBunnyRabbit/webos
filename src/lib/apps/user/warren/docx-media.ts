export interface EncodedMedia {
  file: string;
  width: number;
  height: number;
  data: Blob;
}

function data_url_blob(src: string): Blob {
  const [head, body] = src.split(",", 2);
  const type = head.slice(5).split(";")[0];
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type });
}

function has_alpha(pixels: Uint8ClampedArray): boolean {
  for (let index = 3; index < pixels.length; index += 4) if (pixels[index] < 255) return true;
  return false;
}

// Word before Microsoft 365 and other readers don't show WebP, so pictures go in as PNG when they have see-through
// parts (a logo) and JPEG otherwise (a photo).
export async function encode_media(sources: string[]): Promise<Map<string, EncodedMedia>> {
  const media = new Map<string, EncodedMedia>();
  for (const src of sources) {
    const bitmap = await createImageBitmap(data_url_blob(src));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d")!;
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
    const png = has_alpha(context.getImageData(0, 0, canvas.width, canvas.height).data);
    const data = await canvas.convertToBlob(png ? { type: "image/png" } : { type: "image/jpeg", quality: 0.9 });
    media.set(src, { file: `image${media.size + 1}.${png ? "png" : "jpeg"}`, width: canvas.width, height: canvas.height, data });
  }
  return media;
}
