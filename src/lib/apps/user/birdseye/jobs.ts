import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, {
  TaskJobStatus,
  type AppsService,
  type FilesService,
  type TaskJob,
  type TasksService,
} from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
import { error_message, format_bytes } from "$lib/core/utils";
import type { Bounds, Dimensions } from "$lib/core/utils/type";
import { capture } from "$kit/utils/video/capture";
import { audio_slices, decode_audio, WebmEncoder } from "$kit/utils/video/encode";
import { even_size, format_time, Quality, video_bitrate } from "$kit/utils/video/plan";
import { to_gray } from "./ncc";
import { centre_camera, draw_locked, type RenderSettings } from "./render";
import { path_at, FrameStatus, status_of, type CameraPath } from "./path";
import { Tracker, type TrackPoint } from "./tracker";

export const VIDEOS = "/home/Videos";

/** Above this, a frame's work yields so the window stays responsive; playback holds meanwhile. */
const SLICE_MS = 8;

const files = () => kernel.service<FilesService>("files");
const tasks = () => kernel.service<TasksService>("tasks");
const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

export interface TrackRun {
  app_id: AppId;
  name: string;
  file: Blob;
  frame: Dimensions;
  duration: number;
  box: Bounds;
  from: number;
  follow_size: boolean;
  scale?: number;
  on_job?: (job: TaskJob) => void;
}

export type TrackOutcome = { ok: true; points: TrackPoint[] } | { ok: false; cancelled: boolean };

export async function run_track(run: TrackRun): Promise<TrackOutcome> {
  let lost = 0;
  const job = tasks().run<TrackPoint[]>(
    run.app_id,
    (context) =>
      createTask<void, TrackPoint[]>({
        name: "Track",
        async execute() {
          context.signal.throwIfAborted();
          lost = 0;
          const tracker = new Tracker({
            box: run.box,
            frame: run.frame,
            follow_size: run.follow_size,
            scale: run.scale,
          });
          const canvas = new OffscreenCanvas(tracker.work.width, tracker.work.height);
          const draw = canvas.getContext("2d", { willReadFrequently: true })!;
          const points: TrackPoint[] = [];
          const span = Math.max(1e-6, run.duration - run.from);
          const read = (video: HTMLVideoElement) => {
            const area = tracker.region();
            draw.drawImage(video, 0, 0, tracker.work.width, tracker.work.height);
            const pixels = draw.getImageData(area.x, area.y, area.width, area.height).data;
            return { region: to_gray(pixels, area.width, area.height), origin: area, pixels };
          };
          const result = await capture({
            file: run.file,
            from: run.from,
            to: run.duration,
            signal: context.signal,
            on_frame: (video, time) => {
              const started = performance.now();
              const { region, origin, pixels } = read(video);
              if (!points.length) {
                tracker.start(region, origin, pixels);
                points.push(tracker.first(time));
              } else {
                const point = tracker.step(region, origin, time, pixels);
                if (status_of(point) === FrameStatus.LOST) lost++;
                points.push(point);
              }
              this.setProgress((time - run.from) / span);
              context.message(
                [`${format_time(time - run.from, 1)} of ${format_time(span, 1)}`, lost && `${lost} lost`]
                  .filter(Boolean)
                  .join(" · ")
              );
              if (performance.now() - started > SLICE_MS) return context.pace();
            },
          });
          this.logger.info(`${result.frames} frames, ${lost} lost`);
          return points;
        },
      })(),
    {
      title: `Tracking ${run.name}`,
      done: (points) => ({
        title: "Tracked",
        message: `${points?.length ?? 0} frames${lost ? ` · ${lost} lost: seek to one and draw the box again` : ""}`,
      }),
      failed: (error, cancelled) => ({
        title: cancelled ? "Tracking cancelled" : "Couldn't track",
        message: cancelled ? "The earlier track is kept" : error_message(error),
      }),
    }
  );
  run.on_job?.(job);
  const points = await job.done;
  if (job.status === TaskJobStatus.DONE && points) return { ok: true, points };
  return { ok: false, cancelled: job.status === TaskJobStatus.CANCELLED };
}

export interface ExportRun {
  app_id: AppId;
  name: string;
  /** `null` for a file from the device; its output goes to Videos. */
  path: string | null;
  file: Blob;
  frame: Dimensions;
  duration: number;
  camera: CameraPath | null;
  settings: RenderSettings;
  on_job?: (job: TaskJob) => void;
}

export interface ExportResult {
  path: string;
  size: number;
}

export function output_name(source: string): string {
  return `${file_stem(source)}-birdseye.webm`;
}

async function output_folder(path: string | null): Promise<string> {
  if (path) return parent_path(path);
  if (await files().get_directory(VIDEOS)) return VIDEOS;
  const home = await files().get_directory(parent_path(VIDEOS));
  if (!home) throw new Error("The home folder is missing.");
  await files().create_directory(home, base_name(VIDEOS));
  return VIDEOS;
}

export async function export_locked(run: ExportRun): Promise<ExportResult | null> {
  let result: ExportResult | null = null;
  const job = tasks().run(
    run.app_id,
    (context) => {
      const out: { blob: Blob | null; audio: AudioBuffer | null } = { blob: null, audio: null };
      const size = even_size(run.frame);
      const read_audio = createTask<void, void>({
        name: "Read audio",
        async execute() {
          context.signal.throwIfAborted();
          context.message("Reading the sound");
          out.audio = await decode_audio(run.file);
          this.logger.info(
            out.audio ? `${out.audio.numberOfChannels} ch · ${format_time(out.audio.duration)}` : "No audio track"
          );
        },
      });
      const render = createTask<void, void>({
        name: "Render video",
        async execute() {
          context.signal.throwIfAborted();
          const audio = out.audio;
          const encoder = await WebmEncoder.create({
            video: { ...size, bitrate: video_bitrate(size, Quality.HIGH), framerate: 30 },
            audio: audio ? { channels: Math.min(2, audio.numberOfChannels) } : undefined,
          });
          try {
            if (audio) for (const data of audio_slices(audio, 0, run.duration)) encoder.encode_audio(data);
            const canvas = new OffscreenCanvas(size.width, size.height);
            const draw = canvas.getContext("2d")!;
            const fallback = centre_camera(run.frame);
            const captured = await capture({
              file: run.file,
              from: 0,
              to: run.duration,
              signal: context.signal,
              on_frame: (video, time) => {
                const camera = run.camera ? path_at(run.camera, time) : fallback;
                draw_locked(draw, video, run.frame, size, camera, run.settings);
                encoder.encode_frame(canvas, Math.round(time * 1e6));
                this.setProgress(time / Math.max(1e-6, run.duration));
                context.message(`${format_time(time, 1)} of ${format_time(run.duration, 1)}`);
                if (encoder.busy) return encoder.drained();
              },
            });
            this.logger.info(`${captured.frames} frames · ${size.width} × ${size.height}`);
            out.blob = await encoder.finish(captured.end * 1000);
          } finally {
            encoder.close();
          }
        },
      });
      const write = createTask<void, void>({
        name: "Write file",
        async execute() {
          context.signal.throwIfAborted();
          const blob = out.blob!;
          context.message(`Writing ${format_bytes(blob.size)}`);
          const folder = await output_folder(run.path);
          const directory = await files().get_directory(folder);
          if (!directory) throw new Error(`${folder}: no such folder`);
          const handle = await files().create_file(directory, output_name(run.name), { content: blob });
          result = { path: child_path(folder, handle.name), size: blob.size };
          this.logger.info(`${result.path} · ${format_bytes(result.size)}`);
        },
      });
      return createTaskGroup({ name: "Export", tasks: () => [read_audio(), render(), write()] })();
    },
    {
      title: `Exporting ${run.name}`,
      done: () => ({
        title: "Video saved",
        message: result ? `${result.path} · ${format_bytes(result.size)}` : undefined,
        actions: result
          ? [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(result!.path) }]
          : [],
      }),
      failed: (error, cancelled) => ({
        title: cancelled ? "Cancelled" : "Couldn't save the video",
        message: cancelled ? "Nothing was saved" : error_message(error),
      }),
    }
  );
  run.on_job?.(job);
  await job.done;
  return job.status === TaskJobStatus.DONE ? result : null;
}
