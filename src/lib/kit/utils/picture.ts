export const DEFAULT_MAX_SIDE = 1200;
export const DEFAULT_QUALITY = 0.8;

export interface PictureOptions {
  max_side?: number;
  quality?: number;
}

export function fit_size(width: number, height: number, max = DEFAULT_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function blob_to_data_url(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Couldn't read the picture"));
    reader.readAsDataURL(blob);
  });
}

export async function encode_webp(source: CanvasImageSource, natural_width: number, natural_height: number, options: PictureOptions = {}): Promise<string> {
  const { width, height } = fit_size(natural_width, natural_height, options.max_side);
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return blob_to_data_url(await canvas.convertToBlob({ type: "image/webp", quality: options.quality ?? DEFAULT_QUALITY }));
}

export async function picture_data_url(blob: Blob, options: PictureOptions = {}): Promise<string> {
  // Decoded through <img> rather than createImageBitmap(blob), which rejects SVG.
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode().catch(() => {
      throw new Error("The picture couldn't be read");
    });
    return await encode_webp(image, image.naturalWidth || 300, image.naturalHeight || 150, options);
  } finally {
    URL.revokeObjectURL(url);
  }
}
