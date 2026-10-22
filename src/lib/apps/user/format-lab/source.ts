import { file_extension, file_stem } from "$lib/core/api/services/files/path";
import { CODECS, type CodecFormat } from "$kit/utils/codecs/formats";

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
