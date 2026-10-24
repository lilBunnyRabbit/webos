import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, {
  TaskJobStatus,
  type AppsService,
  type FilesService,
  type TaskContext,
  type TaskJob,
  type TasksService,
} from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { error_message, format_bytes } from "$lib/core/utils";
import { capture } from "$kit/utils/video/capture";
import { audio_slices, decode_audio, WebmEncoder } from "$kit/utils/video/encode";
import { gif_local_frame, gif_start, GIF_TRAILER } from "./gif";
import {
  even_size,
  format_eta,
  format_time,
  gif_playback_rate,
  gif_size,
  Output,
  output_name,
  video_bitrate,
  type Range,
  type Size,
} from "$kit/utils/video/plan";
import type { Quality } from "./kinds";
import { map_pixels, median_cut } from "$kit/utils/codecs/quantize";

export const VIDEOS = "/home/Videos";

const files = () => kernel.service<FilesService>("files");
const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

export interface ClipSource {
  name: string;
  /** `null` for a file from the device; its output goes to Videos. */
  path: string | null;
  file: File;
  size: Size;
}

export type ClipSettings =
  | { output: typeof Output.WEBM; quality: Quality; audio: boolean }
  | { output: typeof Output.GIF; fps: number; width: number; dither: boolean }
  | { output: typeof Output.AUDIO };

export interface ClipRun {
  app_id: AppId;
  source: ClipSource;
  range: Range;
  settings: ClipSettings;
  /** Folder and name to write; beside the source, or in Videos, by default. A taken name gets a free one. */
  target?: { folder: string; name: string };
  signal?: AbortSignal;
  on_job?: (job: TaskJob) => void;
}

export interface ClipResult {
  path: string;
  size: number;
}

export type ClipOutcome = { ok: true; result: ClipResult } | { ok: false; cancelled: boolean; error: string };

async function videos_folder(): Promise<string> {
  if (await files().get_directory(VIDEOS)) return VIDEOS;
  const home = await files().get_directory(parent_path(VIDEOS));
  if (!home) throw new Error("The home folder is missing.");
  await files().create_directory(home, base_name(VIDEOS));
  return VIDEOS;
}

async function write(blob: Blob, run: ClipRun): Promise<ClipResult> {
  const folder = run.target?.folder ?? (run.source.path ? parent_path(run.source.path) : await videos_folder());
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`${folder}: no such folder`);
  const handle = await files().create_file(
    directory,
    run.target?.name ?? output_name(run.source.name, run.settings.output),
    { content: blob }
  );
  return { path: child_path(folder, handle.name), size: blob.size };
}

function progress_line(range: Range, time: number, started: number): string {
  const done = Math.max(0, time - range.from);
  const total = range.to - range.from;
  const elapsed = (performance.now() - started) / 1000;
  const eta = done > 0.25 ? format_eta((elapsed / done) * (total - done)) : "";
  return [`${format_time(done, 1)} of ${format_time(total, 1)}`, eta].filter(Boolean).join(" · ");
}

interface Step {
  name: string;
  run: (task: { progress: (value: number) => void; log: (text: string) => void }) => Promise<void>;
}

function webm_steps(
  run: ClipRun,
  context: TaskContext,
  out: { blob: Blob | null },
  settings: { quality: Quality; audio: boolean }
): Step[] {
  const { range, source } = run;
  const size = even_size(source.size);
  let audio: AudioBuffer | null = null;
  const steps: Step[] = [];
  if (settings.audio) {
    steps.push({
      name: "Read audio",
      async run(task) {
        context.signal.throwIfAborted();
        context.message("Reading the sound");
        audio = await decode_audio(source.file);
        task.log(audio ? `${audio.numberOfChannels} ch · ${format_time(audio.duration)}` : "No audio track");
      },
    });
  }
  steps.push({
    name: "Encode video",
    async run(task) {
      context.signal.throwIfAborted();
      const encoder = await WebmEncoder.create({
        video: { ...size, bitrate: video_bitrate(size, settings.quality), framerate: 30 },
        audio: audio ? { channels: Math.min(2, audio.numberOfChannels) } : undefined,
      });
      try {
        if (audio) for (const data of audio_slices(audio, range.from, range.to)) encoder.encode_audio(data);
        const resize = size.width !== source.size.width || size.height !== source.size.height;
        const canvas = resize ? new OffscreenCanvas(size.width, size.height) : null;
        const draw = canvas?.getContext("2d");
        const started = performance.now();
        const result = await capture({
          file: source.file,
          ...range,
          signal: context.signal,
          on_frame(video, time) {
            draw?.drawImage(video, 0, 0, size.width, size.height);
            encoder.encode_frame(canvas ?? video, Math.round(Math.max(0, time - range.from) * 1e6));
            task.progress((time - range.from) / (range.to - range.from));
            context.message(progress_line(range, time, started));
            if (encoder.busy) return encoder.drained();
          },
        });
        task.log(`${result.frames} frames`);
        out.blob = await encoder.finish((result.end - range.from) * 1000);
      } finally {
        encoder.close();
      }
    },
  });
  return steps;
}

function gif_steps(
  run: ClipRun,
  context: TaskContext,
  out: { blob: Blob | null },
  settings: { fps: number; width: number; dither: boolean }
): Step[] {
  const { range, source } = run;
  const size = gif_size(source.size, settings.width);
  return [
    {
      name: "Capture frames",
      async run(task) {
        context.signal.throwIfAborted();
        const canvas = new OffscreenCanvas(size.width, size.height);
        const draw = canvas.getContext("2d", { willReadFrequently: true })!;
        draw.imageSmoothingQuality = "high";
        const parts: Uint8Array<ArrayBuffer>[] = [gif_start(size.width, size.height)];
        const slot_ms = 1000 / settings.fps;
        let pending: { palette: Uint8Array; indices: Uint8Array } | null = null;
        let next_slot = 0;
        // Delays are rounded on a running total so the GIF's length doesn't drift from the clip's.
        let written_cs = 0;
        const flush = (until: number) => {
          if (!pending) return;
          const delay = Math.max(2, Math.round((until * slot_ms) / 10) - written_cs);
          written_cs += delay;
          parts.push(gif_local_frame({ ...size, palette: pending.palette, indices: pending.indices, delay }));
        };
        const started = performance.now();
        const result = await capture({
          file: source.file,
          ...range,
          rate: gif_playback_rate(settings.fps),
          signal: context.signal,
          on_frame(video, time) {
            const slot = Math.floor((time - range.from) * settings.fps + 1e-6);
            if (slot < next_slot) return;
            next_slot = slot + 1;
            draw.drawImage(video, 0, 0, size.width, size.height);
            const rgba = draw.getImageData(0, 0, size.width, size.height).data;
            task.progress((time - range.from) / (range.to - range.from));
            context.message(progress_line(range, time, started));
            return (async () => {
              await context.pace();
              const palette = median_cut(rgba, 256);
              const indices = map_pixels(rgba, size.width, size.height, palette, settings.dither);
              flush(slot);
              pending = { palette, indices };
            })();
          },
        });
        flush(Math.max(next_slot, Math.ceil((result.end - range.from) * settings.fps - 1e-6)));
        task.log(`${parts.length - 1} frames · ${size.width} × ${size.height}`);
        out.blob = new Blob([...parts, GIF_TRAILER], { type: "image/gif" });
      },
    },
  ];
}

function audio_steps(run: ClipRun, context: TaskContext, out: { blob: Blob | null }): Step[] {
  const { range, source } = run;
  return [
    {
      name: "Encode audio",
      async run(task) {
        context.signal.throwIfAborted();
        context.message("Reading the sound");
        const audio = await decode_audio(source.file);
        if (!audio) throw new Error("This video has no sound");
        context.signal.throwIfAborted();
        const encoder = await WebmEncoder.create({ audio: { channels: Math.min(2, audio.numberOfChannels) } });
        try {
          const to = Math.min(range.to, audio.duration);
          for (const data of audio_slices(audio, range.from, to)) encoder.encode_audio(data);
          task.progress(0.9);
          out.blob = await encoder.finish((to - range.from) * 1000);
        } finally {
          encoder.close();
        }
      },
    },
  ];
}

const TITLES: Record<Output, string> = { webm: "Trimming", gif: "Making a GIF of", audio: "Extracting the sound of" };
const DONE: Record<Output, string> = { webm: "Clip saved", gif: "GIF saved", audio: "Sound saved" };

export async function export_clip(run: ClipRun): Promise<ClipOutcome> {
  const { settings } = run;
  let result: ClipResult | null = null;
  const job = kernel.service<TasksService>("tasks").run(
    run.app_id,
    (context) => {
      const out: { blob: Blob | null } = { blob: null };
      const steps =
        settings.output === Output.WEBM
          ? webm_steps(run, context, out, settings)
          : settings.output === Output.GIF
            ? gif_steps(run, context, out, settings)
            : audio_steps(run, context, out);
      const tasks = [
        ...steps.map((step) =>
          createTask<void, void>({
            name: step.name,
            async execute() {
              await step.run({ progress: (value) => this.setProgress(value), log: (text) => this.logger.info(text) });
            },
          })
        ),
        createTask<void, void>({
          name: "Write file",
          async execute() {
            context.signal.throwIfAborted();
            context.message(`Writing ${format_bytes(out.blob!.size)}`);
            result = await write(out.blob!, run);
            this.logger.info(`${result.path} · ${format_bytes(result.size)}`);
          },
        }),
      ];
      return createTaskGroup({ name: TITLES[settings.output], tasks: () => tasks.map((task) => task()) })();
    },
    {
      title: `${TITLES[settings.output]} ${run.source.name}`,
      signal: run.signal,
      done: () => ({
        title: DONE[settings.output],
        message: result ? `${result.path} · ${format_bytes(result.size)}` : undefined,
        actions: result
          ? [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(result!.path) }]
          : [],
      }),
      failed: (error, cancelled) => ({
        title: cancelled ? "Cancelled" : `Couldn't save the ${settings.output === Output.GIF ? "GIF" : "clip"}`,
        message: cancelled ? "Nothing was saved" : error_message(error),
      }),
    }
  );
  run.on_job?.(job);
  await job.done;
  if (job.status === TaskJobStatus.DONE && result) return { ok: true, result };
  return { ok: false, cancelled: job.status === TaskJobStatus.CANCELLED, error: job.error ?? "failed" };
}
