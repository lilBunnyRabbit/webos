import { file_stem } from "$lib/core/api/services/files/path";

export const Quality = { LOW: "low", MEDIUM: "medium", HIGH: "high", FIT: "fit" } as const;
export type Quality = (typeof Quality)[keyof typeof Quality];
export type FixedQuality = Exclude<Quality, typeof Quality.FIT>;
export const QUALITIES = [Quality.LOW, Quality.MEDIUM, Quality.HIGH] as [FixedQuality, ...FixedQuality[]];

export const Output = { CLIP: "clip", GIF: "gif", AUDIO: "audio" } as const;
export type Output = (typeof Output)[keyof typeof Output];

export const ClipFormat = { WEBM: "webm", MP4: "mp4" } as const;
export type ClipFormat = (typeof ClipFormat)[keyof typeof ClipFormat];
export const CLIP_FORMATS = Object.values(ClipFormat) as [ClipFormat, ...ClipFormat[]];

/** Output size by the short side: `1080` is 1920 × 1080 for a landscape video and 1080 × 1920 for a portrait one. */
export const OutputSize = { ORIGINAL: "original", P1080: "1080", P720: "720", P480: "480" } as const;
export type OutputSize = (typeof OutputSize)[keyof typeof OutputSize];
export const OUTPUT_SIZES = Object.values(OutputSize) as [OutputSize, ...OutputSize[]];

const BITS_PER_PIXEL: Record<FixedQuality, number> = { low: 0.04, medium: 0.08, high: 0.16 };
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

export function video_bitrate(size: Size, quality: FixedQuality, framerate = 30): number {
  return Math.max(MIN_BITRATE, Math.round(size.width * size.height * framerate * BITS_PER_PIXEL[quality]));
}

export const AUDIO_BITRATE = 128_000;
const FIT_AUDIO_LOW = 64_000;
/** Aims under the target: container overhead, and the encoder drifting even at a constant bitrate. */
const FIT_MARGIN = 0.95;
const FIT_AUDIO_SHARE = 0.15;
const FIT_SIZES = [OutputSize.P1080, OutputSize.P720, OutputSize.P480] as const;

export type FitPlan =
  | {
      ok: true;
      size: Size;
      video_bps: number;
      audio_bps: number;
      lowered: boolean;
      estimate_bytes: number;
    }
  | { ok: false; max_seconds: number };

export interface FitInput {
  source: Size;
  ceiling: OutputSize;
  seconds: number;
  target_bytes: number;
  audio: boolean;
}

/** Video stops at High's bitrate, so a short clip isn't padded out to the target. */
export function fit_plan({ source, ceiling, seconds, target_bytes, audio }: FitInput): FitPlan {
  const budget = (target_bytes * 8 * FIT_MARGIN) / Math.max(seconds, 1e-3);
  const audio_bps = !audio ? 0 : AUDIO_BITRATE > budget * FIT_AUDIO_SHARE ? FIT_AUDIO_LOW : AUDIO_BITRATE;
  const room = budget - audio_bps;
  const top = scaled_size(source, ceiling);
  const sizes = [top];
  for (const choice of FIT_SIZES) {
    const size = scaled_size(source, choice);
    const last = sizes.at(-1)!;
    if (size.width * size.height < last.width * last.height) sizes.push(size);
  }
  const pick = sizes.find((size) => room / (size.width * size.height * 30) >= BITS_PER_PIXEL.low);
  const size = pick ?? sizes.at(-1)!;
  if (!pick && room < MIN_BITRATE)
    return { ok: false, max_seconds: (target_bytes * 8 * FIT_MARGIN) / (MIN_BITRATE + (audio ? FIT_AUDIO_LOW : 0)) };
  const video_bps = Math.round(Math.min(room, video_bitrate(size, Quality.HIGH)));
  return {
    ok: true,
    size,
    video_bps,
    audio_bps,
    lowered: size !== top,
    estimate_bytes: Math.round(((video_bps + audio_bps) * seconds) / 8),
  };
}

/** Decimal, like the limits sites state: 20 MB is 20,000,000 bytes. */
export function format_mb(bytes: number): string {
  const mb = bytes / 1e6;
  return `${mb >= 10 ? Math.round(mb * 10) / 10 : Math.round(mb * 100) / 100} MB`;
}

export function fit_too_long(target_bytes: number, max_seconds: number): string {
  return `Too long for ${format_mb(target_bytes)}: trim to ~${format_time(Math.floor(max_seconds), 0)}`;
}

/** A plain number is MB. */
export function parse_max_size(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*(kb?|mb?|gb?)?\s*$/i.exec(text);
  if (!match) return null;
  const unit = (match[2] ?? "m")[0]!.toLowerCase();
  const bytes = Math.round(Number(match[1]) * (unit === "k" ? 1e3 : unit === "g" ? 1e9 : 1e6));
  return bytes >= 1 && Number.isSafeInteger(bytes) ? bytes : null;
}

/** VP8, VP9 and H.264 want even sides. */
export function even_size({ width, height }: Size): Size {
  return { width: Math.max(2, width - (width % 2)), height: Math.max(2, height - (height % 2)) };
}

/** Scaled to `target` by the short side, aspect kept, both sides even; never larger than the source. */
export function scaled_size(source: Size, target: OutputSize): Size {
  const short = Math.min(source.width, source.height);
  if (target === OutputSize.ORIGINAL || Number(target) >= short) return even_size(source);
  const scale = Number(target) / short;
  const even = (side: number) => Math.max(2, Math.round((side * scale) / 2) * 2);
  return { width: even(source.width), height: even(source.height) };
}

/** The sizes worth offering for a source: Original plus every smaller one. */
export function size_choices(source: Size): OutputSize[] {
  const short = Math.min(source.width, source.height);
  return OUTPUT_SIZES.filter((size) => size === OutputSize.ORIGINAL || Number(size) < short);
}

// H.264 levels (ITU-T H.264 Table A-1): frame size and rate in 16 × 16 macroblocks, and the level_idc byte.
const AVC_LEVELS = [
  { frame: 1620, rate: 40_500, idc: 0x1e },
  { frame: 3600, rate: 108_000, idc: 0x1f },
  { frame: 5120, rate: 216_000, idc: 0x20 },
  { frame: 8192, rate: 245_760, idc: 0x28 },
  { frame: 8704, rate: 522_240, idc: 0x2a },
  { frame: 22_080, rate: 589_824, idc: 0x32 },
  { frame: 36_864, rate: 983_040, idc: 0x33 },
  { frame: 36_864, rate: 2_073_600, idc: 0x34 },
  { frame: 139_264, rate: 4_177_920, idc: 0x3c },
  { frame: 139_264, rate: 8_355_840, idc: 0x3d },
  { frame: 139_264, rate: 16_711_680, idc: 0x3e },
] as const;

/** The smallest H.264 level that holds this size and frame rate; `null` past level 6.2. */
export function avc_level(size: Size, framerate: number): number | null {
  const across = Math.ceil(size.width / 16);
  const down = Math.ceil(size.height / 16);
  const frame = across * down;
  const level = AVC_LEVELS.find(
    (entry) =>
      frame <= entry.frame &&
      frame * framerate <= entry.rate &&
      // Neither side may pass √(8 × max frame size) macroblocks.
      Math.max(across, down) ** 2 <= 8 * entry.frame
  );
  return level?.idc ?? null;
}

/** High, Main, then Constrained Baseline: the profile_idc and constraint bytes of an `avc1.PPCCLL` codec string. */
export const AVC_PROFILES = ["6400", "4d00", "42e0"] as const;

export function avc_codec(profile: (typeof AVC_PROFILES)[number], level: number): string {
  return `avc1.${profile}${level.toString(16).padStart(2, "0")}`;
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

export function output_name(source: string, output: Output, format: ClipFormat = ClipFormat.WEBM): string {
  const stem = file_stem(source);
  if (output === Output.GIF) return `${stem}.gif`;
  if (output === Output.AUDIO) return `${stem}-audio.webm`;
  return `${stem}-clip.${format}`;
}

export function output_extension(output: Output, format: ClipFormat = ClipFormat.WEBM): string {
  if (output === Output.GIF) return ".gif";
  return output === Output.CLIP ? `.${format}` : ".webm";
}

export function format_eta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s left`;
  return `${Math.round(seconds / 60)} min left`;
}
