import { file_extension, file_stem } from "$lib/core/api/services/files/path";
import { decode } from "$kit/utils/codecs";
import { CODECS, type CodecFormat } from "$kit/utils/codecs/formats";
import { load_image, read_pixels } from "$kit/utils/image";

export const IMAGE_ACCEPT = ["image/*", ".jxl", ".avif"];

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|bmp|svg|avif|jxl)$/i;

export function is_image_name(name: string): boolean {
  return IMAGE_NAME.test(name);
}

export function is_image(file: File): boolean {
  return file.type.startsWith("image/") || is_image_name(file.name);
}

export function converted_name(name: string, format: CodecFormat): string {
  return `${file_stem(name)}${CODECS[format].extension}`;
}

export function is_inspectable(name: string): boolean {
  const extension = file_extension(name);
  return extension === ".avif" || extension === ".jxl";
}

/** The worker decodes what it can (JPEG XL included); SVG needs the page's `<img>`. */
export async function read_image(file: File, signal?: AbortSignal): Promise<ImageData> {
  try {
    return await decode(file, { signal });
  } catch (error) {
    signal?.throwIfAborted();
    if (!file.type.startsWith("image/")) throw error;
    const image = await load_image(file);
    try {
      return read_pixels(image.bitmap);
    } finally {
      image.bitmap.close();
    }
  }
}

export function has_alpha(image: ImageData): boolean {
  for (let index = 3; index < image.data.length; index += 4) if (image.data[index] < 255) return true;
  return false;
}
