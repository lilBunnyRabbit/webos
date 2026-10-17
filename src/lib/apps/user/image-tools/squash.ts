import { ImageFormat } from "$lib/core/utils/image-format";
import { resize_to, type Size } from "../image-editor/edit";

/** No AVIF: browsers can't encode it without a WASM encoder. */
export const SquashFormat = { WEBP: ImageFormat.WEBP, JPEG: ImageFormat.JPEG } as const;
export type SquashFormat = (typeof SquashFormat)[keyof typeof SquashFormat];

export const SQUASH_FORMAT_NAMES = { webp: SquashFormat.WEBP, jpeg: SquashFormat.JPEG } as const;
export type SquashFormatName = keyof typeof SQUASH_FORMAT_NAMES;

export interface SquashOptions {
  format: SquashFormat;
  quality: number;
  /** Longest side in px; `null` keeps the size. */
  max: number | null;
}

export const DEFAULT_SQUASH: SquashOptions = { format: SquashFormat.WEBP, quality: 80, max: null };

export function squashed_size(size: Size, max: number | null): Size {
  if (max === null || Math.max(size.width, size.height) <= max) return size;
  return resize_to(size, size.width >= size.height ? "width" : "height", max, true);
}

/** A sample encode's bytes scaled by pixel count: rough, and high for small samples, which compress worse. */
export function estimate_bytes(sample_bytes: number, sample: Size, target: Size): number {
  return Math.round(sample_bytes * ((target.width * target.height) / (sample.width * sample.height)));
}

export function saved_share(before: number, after: number): number {
  return before > 0 ? 1 - after / before : 0;
}

export function format_share(share: number): string {
  const percent = Math.round(share * 100);
  return percent > 0 ? `−${percent}%` : percent < 0 ? `+${-percent}%` : "0%";
}
