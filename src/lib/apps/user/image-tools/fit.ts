import { file_extension } from "$lib/core/api/services/files/path";
import { ENCODER_FORMATS, ENCODER_INFO, EncoderFormat, encoder_for_mime } from "$kit/utils/codecs/formats";
import type { Size } from "../image-editor/edit";
import { squashed_size } from "./squash";

export const FitFormat = {
  KEEP: "keep",
  JPEG: EncoderFormat.JPEG,
  WEBP: EncoderFormat.WEBP,
  AVIF: EncoderFormat.AVIF,
  JXL: EncoderFormat.JXL,
} as const;
export type FitFormat = (typeof FitFormat)[keyof typeof FitFormat];

export const FIT_FORMATS = Object.values(FitFormat) as [FitFormat, ...FitFormat[]];

export const LIMIT_PRESETS = [500_000, 1_000_000, 2_000_000, 5_000_000, 8_000_000] as const;

/** Fit's own quality range: the floor is where scaling down starts to look better than more compression. */
export const FIT_QUALITY = { floor: 50, ceiling: 92 } as const;

/** Each scale round aims a little under the limit, so one round usually lands it. */
const SCALE_MARGIN = 0.95;
const MAX_ROUNDS = 12;

const UNITS: Record<string, number> = { "": 1, b: 1, k: 1e3, kb: 1e3, m: 1e6, mb: 1e6, g: 1e9, gb: 1e9 };

/**
 * A size limit in bytes. Sites mean either 10^6 or 2^20 by "MB"; the smaller reading fits both, so units are decimal.
 * `null` when it isn't a size.
 */
export function parse_limit(text: string): number | null {
  const match = /^\s*(\d+(?:\.\d+)?)\s*([kmg]?b?)\s*$/i.exec(text);
  if (!match) return null;
  const bytes = Math.floor(Number(match[1]) * UNITS[match[2].toLowerCase()]);
  return bytes >= 1 && Number.isSafeInteger(bytes) ? bytes : null;
}

export function format_limit(bytes: number): string {
  if (bytes < 1e3) return `${bytes} B`;
  const [unit, size] = bytes < 1e6 ? ["KB", 1e3] : bytes < 1e9 ? ["MB", 1e6] : ["GB", 1e9];
  const value = bytes / size;
  return `${value >= 100 ? Math.round(value) : Number(value.toFixed(value >= 10 ? 1 : 2))} ${unit}`;
}

export function source_format(type: string, name: string): EncoderFormat | null {
  const by_type = encoder_for_mime(type);
  if (by_type) return by_type;
  const extension = file_extension(name).toLowerCase();
  if (extension === ".jpeg") return EncoderFormat.JPEG;
  if (extension === ".tif") return EncoderFormat.TIFF;
  return ENCODER_FORMATS.find((format) => ENCODER_INFO[format].extension === extension) ?? null;
}

/** Keep falls back to PNG for transparency and JPEG otherwise when the kit can't write the source's format (SVG, HEIC). */
export function fit_target(format: FitFormat, source: EncoderFormat | null, alpha: boolean): { target: EncoderFormat; fallback: boolean } {
  if (format !== FitFormat.KEEP) return { target: format, fallback: false };
  if (source) return { target: source, fallback: false };
  return { target: alpha ? EncoderFormat.PNG : EncoderFormat.JPEG, fallback: true };
}

export interface CopyCheck {
  size: number;
  limit: number;
  same_format: boolean;
  max_side_hit: boolean;
}

export function can_copy({ size, limit, same_format, max_side_hit }: CopyCheck): boolean {
  return size <= limit && same_format && !max_side_hit;
}

export function scale_by(size: Size, factor: number): Size {
  const width = Math.max(1, Math.round(size.width * factor));
  const height = Math.max(1, Math.round(size.height * factor));
  if (width < size.width || height < size.height || (size.width === 1 && size.height === 1)) return { width, height };
  return { width: Math.max(1, size.width - 1), height: Math.max(1, Math.round((size.height * (size.width - 1)) / size.width)) };
}

export interface FitSpec {
  limit: number;
  lossy: boolean;
  floor: number;
  ceiling: number;
  source: Size;
  /** Longest side in px; `null` keeps the size. */
  max: number | null;
}

export interface Attempt<T> {
  width: number;
  height: number;
  quality: number | null;
  size: number;
  value: T;
}

export type FitEncode<T> = (size: Size, quality: number | null) => Promise<{ size: number; value: T }>;

export interface FitOutcome<T> {
  fitted: boolean;
  /** The highest quality that fits at the largest size that fits; when nothing fits, the smallest file tried. */
  best: Attempt<T>;
  attempts: number;
}

/**
 * Highest integer quality in [floor, ceiling] under the limit, by binary search. When even the floor is over, scale
 * by √(limit / size at floor) × 0.95 and search again. Lossless formats only scale.
 */
export async function search_fit<T>(
  spec: FitSpec,
  encode: FitEncode<T>,
  on_attempt?: (attempt: Attempt<T>) => void
): Promise<FitOutcome<T>> {
  const ceiling = Math.round(spec.ceiling);
  const floor = Math.min(Math.round(spec.floor), ceiling);
  let attempts = 0;
  let smallest: Attempt<T> | null = null;

  const attempt = async (size: Size, quality: number | null): Promise<Attempt<T>> => {
    const { size: bytes, value } = await encode(size, quality);
    attempts++;
    const result = { ...size, quality, size: bytes, value };
    if (!smallest || bytes < smallest.size) smallest = result;
    on_attempt?.(result);
    return result;
  };
  const fits = (result: Attempt<T>) => result.size <= spec.limit;

  let size = squashed_size(spec.source, spec.max);
  for (let round = 0; round < MAX_ROUNDS; round++) {
    let over: Attempt<T>;
    if (spec.lossy) {
      const top = await attempt(size, ceiling);
      if (fits(top)) return { fitted: true, best: top, attempts };
      if (floor === ceiling) over = top;
      else {
        const bottom = await attempt(size, floor);
        if (fits(bottom)) {
          let best = bottom;
          let low = floor;
          let high = ceiling;
          while (high - low > 1) {
            const middle = Math.floor((low + high) / 2);
            const tried = await attempt(size, middle);
            if (fits(tried)) {
              best = tried;
              low = middle;
            } else high = middle;
          }
          return { fitted: true, best, attempts };
        }
        over = bottom;
      }
    } else {
      over = await attempt(size, null);
      if (fits(over)) return { fitted: true, best: over, attempts };
    }
    if (size.width === 1 && size.height === 1) break;
    size = scale_by(size, Math.sqrt(spec.limit / over.size) * SCALE_MARGIN);
  }
  return { fitted: false, best: smallest!, attempts };
}

export interface FitWarningInput {
  alpha: boolean;
  target_alpha: boolean;
  animated: boolean;
  fitted: boolean;
  limit: number;
}

export function fit_warnings({ alpha, target_alpha, animated, fitted, limit }: FitWarningInput): string[] {
  return [
    alpha && !target_alpha ? "Transparency flattened onto white" : null,
    animated ? "Animated: only the first frame is kept" : null,
    fitted ? null : `Didn't fit under ${format_limit(limit)}, even at the smallest size tried`,
  ].filter((line) => line !== null);
}
