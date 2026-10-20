import { file_stem } from "$lib/core/api/services/files/path";

export const Quality = { LOW: "low", MEDIUM: "medium", HIGH: "high" } as const;
export type Quality = (typeof Quality)[keyof typeof Quality];
export const QUALITIES = Object.values(Quality) as [Quality, ...Quality[]];

export const Output = { WEBM: "webm", GIF: "gif", AUDIO: "audio" } as const;
export type Output = (typeof Output)[keyof typeof Output];

const BITS_PER_PIXEL: Record<Quality, number> = { low: 0.04, medium: 0.08, high: 0.16 };
const MIN_BITRATE = 250_000;

export const GIF_WIDTHS = [160, 240, 320, 480, 640, 800] as const;

/** Rough LZW output per pixel, measured on generated test footage; real footage with grain runs higher. */
const GIF_BYTES_PER_PIXEL = { dither: 0.7, plain: 0.5 };
export const GIF_LARGE_BYTES = 20 * 1024 * 1024;
export const GIF_LONG_FRAMES = 600;

export interface Size {
  width: number;
  height: number;
}

export interface Range {
  from: number;
  to: number;
}

export function video_bitrate(size: Size, quality: Quality, framerate = 30): number {
  return Math.max(MIN_BITRATE, Math.round(size.width * size.height * framerate * BITS_PER_PIXEL[quality]));
}

/** VP8 and VP9 want even sides. */
export function even_size({ width, height }: Size): Size {
  return { width: Math.max(2, width - (width % 2)), height: Math.max(2, height - (height % 2)) };
}

export function gif_size(source: Size, width: number): Size {
  const out = Math.max(1, Math.min(Math.round(width), source.width));
  return { width: out, height: Math.max(1, Math.round((out * source.height) / source.width)) };
}

export function gif_frame_count(range: Range, fps: number): number {
  return Math.max(1, Math.ceil((range.to - range.from) * fps - 1e-6));
}

export function estimate_gif_bytes(size: Size, frames: number, dither: boolean): number {
  return Math.round(
    size.width * size.height * frames * (dither ? GIF_BYTES_PER_PIXEL.dither : GIF_BYTES_PER_PIXEL.plain)
  );
}

/**
 * Playback speed for capturing GIF frames. Chrome presents up to the screen's rate (60 Hz) of frames, and a GIF only
 * needs one per 1/fps, so lower rates can play faster. Capped at 4× where frames start going missing.
 */
export function gif_playback_rate(fps: number): number {
  return Math.max(1, Math.min(4, Math.floor(30 / fps)));
}

export function clamp_range(range: Range, duration: number): Range {
  const from = Math.min(Math.max(0, range.from), duration);
  return { from, to: Math.min(Math.max(from, range.to), duration) };
}

export function format_time(seconds: number, precision = 2): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = (safe - minutes * 60).toFixed(precision).padStart(precision ? precision + 3 : 2, "0");
  if (minutes < 60) return `${minutes}:${rest}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${rest}`;
}

/** `90`, `1:30`, `1:30.5` or `1:01:30`; `null` when it isn't a time. */
export function parse_time(text: string): number | null {
  const parts = text.trim().split(":");
  if (parts.length > 3 || parts.some((part) => !/^\d+(\.\d+)?$/.test(part))) return null;
  const value = parts.reduce((total, part) => total * 60 + Number(part), 0);
  return Number.isFinite(value) ? value : null;
}

export function output_name(source: string, output: Output): string {
  const stem = file_stem(source);
  if (output === Output.GIF) return `${stem}.gif`;
  return `${stem}-${output === Output.AUDIO ? "audio" : "clip"}.webm`;
}

export function output_extension(output: Output): string {
  return output === Output.GIF ? ".gif" : ".webm";
}

export function format_eta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s left`;
  return `${Math.round(seconds / 60)} min left`;
}
