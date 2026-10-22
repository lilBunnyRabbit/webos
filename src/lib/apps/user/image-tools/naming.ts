import { file_extension, file_stem } from "$lib/core/api/services/files/path";
import { ImageFormat, format_of } from "$kit/utils/image-format";

export function transparent_name(name: string, extension: string): string {
  return `${file_stem(name)}-transparent${extension}`;
}

export function trimmed_name(name: string, extension: string): string {
  return `${file_stem(name)}-cropped${extension}`;
}

export function joined_name(extension: string): string {
  return `joined${extension}`;
}

export function redacted_name(name: string, extension: string): string {
  return `${file_stem(name)}-redacted${extension}`;
}

export function patched_name(name: string): string {
  return `${file_stem(name)}-patched.png`;
}

export function squashed_name(name: string, extension: string): string {
  return `${file_stem(name)}-squashed${extension}`;
}

export function fitted_name(name: string, extension: string): string {
  return `${file_stem(name)}-fit${extension}`;
}

export function split_folder_name(name: string): string {
  return `${file_stem(name)}-split`;
}

export function tile_name(name: string, number: number): string {
  return `${file_stem(name)}_${number}.png`;
}

/** The source's own format and extension; PNG when it has none, or when `alpha` rules out JPEG. */
export function kept_format(name: string, alpha: boolean): { format: ImageFormat; extension: string } {
  const format = format_of(name);
  if (!format || (alpha && format === ImageFormat.JPEG)) return { format: ImageFormat.PNG, extension: ".png" };
  return { format, extension: file_extension(name) };
}

export function is_image_name(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i.test(name);
}

export function poster_name(name: string): string {
  return `${file_stem(name)}-poster.pdf`;
}
