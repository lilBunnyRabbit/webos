export function is_jxl(file: File): boolean {
  return file.type === "image/jxl" || file.name.toLowerCase().endsWith(".jxl");
}

/** Chromium can't decode JPEG XL, so `<img>` gets a PNG of what the codec worker decoded. */
export async function jxl_to_png(file: File): Promise<Blob> {
  const { decode } = await import("$kit/utils/codecs");
  const image = await decode(file);
  const canvas = new OffscreenCanvas(image.width, image.height);
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}
