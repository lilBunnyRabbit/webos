import { createTask } from "@lilbunnyrabbit/task-manager";
import kernel, { type TaskJob, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { error_message } from "$lib/core/utils";
import { ENCODERS } from "$kit/utils/codecs/encoders";
import { ENCODER_INFO, type EncoderFormat } from "$kit/utils/codecs/formats";
import { has_alpha, read_image } from "$kit/utils/codecs/source";
import type { Size } from "../image-editor/edit";
import {
  can_copy,
  fit_target,
  fit_warnings,
  format_limit,
  search_fit,
  source_format,
  type Attempt,
  type FitFormat,
} from "./fit";

export interface FitSource {
  name: string;
  path: string | null;
  file: File;
}

export interface FitSettings {
  limit: number;
  format: FitFormat;
  max: number | null;
  floor: number;
  ceiling: number;
}

export interface FitResult {
  blob: Blob;
  target: EncoderFormat;
  width: number;
  height: number;
  quality: number | null;
  source: Size & { size: number };
  /** Already under the limit in its own format: the original bytes. */
  copied: boolean;
  fitted: boolean;
  /** Keep met a format the kit can't write. */
  fallback: boolean;
  warnings: string[];
  attempts: number;
}

export async function is_animated(file: File): Promise<boolean> {
  if (!/^image\/(gif|png|apng|webp|avif)$/.test(file.type)) return false;
  let decoder: ImageDecoder | null = null;
  try {
    decoder = new ImageDecoder({ data: file.stream(), type: file.type });
    await decoder.tracks.ready;
    const track = decoder.tracks.selectedTrack;
    if (!track?.animated) return false;
    await decoder.completed;
    return track.frameCount > 1;
  } catch {
    return false;
  } finally {
    decoder?.close();
  }
}

function scaled(bitmap: ImageBitmap, size: Size): ImageData {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return context.getImageData(0, 0, size.width, size.height);
}

export async function fit_image(
  source: FitSource,
  settings: FitSettings,
  signal: AbortSignal,
  on_attempt?: (attempt: Attempt<Blob>) => void
): Promise<FitResult> {
  const pixels = await read_image(source.file, signal);
  const alpha = has_alpha(pixels);
  const animated = await is_animated(source.file);
  const kind = source_format(source.file.type, source.name);
  const { target, fallback } = fit_target(settings.format, kind, alpha);
  const info = ENCODER_INFO[target];
  const original = { width: pixels.width, height: pixels.height, size: source.file.size };
  const warn = (fitted: boolean) =>
    fit_warnings({ alpha, target_alpha: info.alpha, animated, fitted, limit: settings.limit });

  const max_side_hit = settings.max !== null && Math.max(pixels.width, pixels.height) > settings.max;
  if (can_copy({ size: source.file.size, limit: settings.limit, same_format: kind === target, max_side_hit })) {
    return {
      blob: source.file,
      target,
      width: pixels.width,
      height: pixels.height,
      quality: null,
      source: original,
      copied: true,
      fitted: true,
      fallback,
      warnings: [],
      attempts: 0,
    };
  }

  const bitmap = await createImageBitmap(pixels);
  let cached: { key: string; image: ImageData } | null = null;
  const image_at = (size: Size) => {
    if (size.width === pixels.width && size.height === pixels.height) return pixels;
    const key = `${size.width}x${size.height}`;
    if (cached?.key !== key) cached = { key, image: scaled(bitmap, size) };
    return cached.image;
  };
  try {
    const outcome = await search_fit(
      { limit: settings.limit, lossy: info.lossy, floor: settings.floor, ceiling: settings.ceiling, source: pixels, max: settings.max },
      async (size, quality) => {
        signal.throwIfAborted();
        const blob = await ENCODERS[target].encode(image_at(size), { quality: quality ?? undefined, signal });
        return { size: blob.size, value: blob };
      },
      on_attempt
    );
    const { best } = outcome;
    return {
      blob: best.value,
      target,
      width: best.width,
      height: best.height,
      quality: best.quality,
      source: original,
      copied: false,
      fitted: outcome.fitted,
      fallback,
      warnings: warn(outcome.fitted),
      attempts: outcome.attempts,
    };
  } finally {
    bitmap.close();
  }
}

export function describe_attempt({ width, height, quality, size }: Attempt<unknown>): string {
  return `${width}×${height}${quality === null ? "" : ` at quality ${quality}`} → ${format_limit(size)}`;
}

export interface FitRunOptions {
  signal?: AbortSignal;
  on_job?: (job: TaskJob) => void;
}

export async function run_fit(app_id: AppId, source: FitSource, settings: FitSettings, options: FitRunOptions = {}): Promise<FitResult | null> {
  let result: FitResult | null = null;
  const label = format_limit(settings.limit);
  const job = kernel.service<TasksService>("tasks").run(
    app_id,
    (context) => {
      let last: string | null = null;
      return createTask<void, void>({
        name: source.name,
        parse() {
          if (result) return { status: `${format_limit(result.blob.size)} · ${result.width}×${result.height}` };
          return last ? { status: last } : undefined;
        },
        async execute() {
          result = await fit_image(source, settings, context.signal, (attempt) => {
            last = describe_attempt(attempt);
            this.logger.info(last);
            context.message(last);
          });
        },
      })();
    },
    {
      title: `Fitting ${source.name} under ${label}`,
      signal: options.signal,
      done: () => null,
      failed: (error, cancelled) => ({
        title: cancelled ? "Fit cancelled" : `Couldn't fit ${source.name}`,
        message: cancelled ? undefined : error_message(error),
      }),
    }
  );
  options.on_job?.(job);
  await job.done;
  return result;
}
