import { createTask, createTaskGroup, ExecutionMode } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type FilesService, type TaskJob, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { parent_path } from "$lib/core/api/services/files/path";
import { error_message, format_bytes } from "$lib/core/utils";
import { encode_image, extension_for, load_image } from "$kit/utils/image";
import type { Size } from "../image-editor/edit";
import { is_image_name, squashed_name } from "./naming";
import { format_share, saved_share, squashed_size, type SquashOptions } from "./squash";
import { pictures_folder } from "./test-image-job";

const files = () => kernel.service<FilesService>("files");

const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

export interface SquashSource {
  name: string;
  path: string | null;
  file: File;
}

export interface SquashResult {
  path: string;
  size: number;
  width: number;
  height: number;
}

export interface SquashRun {
  app_id: AppId;
  sources: SquashSource[];
  options: SquashOptions;
  /** `null` writes beside each source, and files without a folder go to Pictures. */
  folder: string | null;
  signal?: AbortSignal;
  on_job?: (job: TaskJob) => void;
  on_result?: (index: number, result: SquashResult) => void;
}

export interface SquashOutcome {
  status: TaskJobStatus;
  error: string | null;
  results: (SquashResult | null)[];
}

export async function images_in(folder: string): Promise<string[]> {
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`${folder}: no such folder`);
  return (await files().list(directory))
    .filter((item) => item.kind === "file" && is_image_name(item.name))
    .map((item) => child_path(folder, item.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export function target_folder(source: SquashSource, folder: string | null): string | null {
  return folder ?? (source.path === null ? null : parent_path(source.path));
}

// Parallel tasks all start at once, and a batch of photos decoded together runs the tab out of memory.
function limit(count: number) {
  let free = count;
  const waiting: (() => void)[] = [];
  return async <T>(work: () => Promise<T>): Promise<T> => {
    if (free > 0) free--;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else free++;
    }
  };
}

function draw(bitmap: ImageBitmap, size: Size): OffscreenCanvas {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d")!;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  return canvas;
}

/** One task per image in a parallel group. Retry only redoes the images that weren't written. */
export async function squash_images(run: SquashRun): Promise<SquashOutcome> {
  const { sources, options } = run;
  const results: (SquashResult | null)[] = sources.map(() => null);
  const extension = extension_for(options.format);
  const total = sources.length;

  const job = kernel.service<TasksService>("tasks").run(
    run.app_id,
    (context) => {
      const gate = limit(Math.max(1, Math.min(4, navigator.hardwareConcurrency ?? 4)));
      const count = () => results.filter(Boolean).length;
      const squash = (index: number) => {
        const source = sources[index];
        return createTask<void, void>({
          name: source.name,
          parse() {
            const result = results[index];
            if (!result) return { status: format_bytes(source.file.size) };
            const share = format_share(saved_share(source.file.size, result.size));
            return { status: `${format_bytes(source.file.size)} → ${format_bytes(result.size)} (${share})` };
          },
          execute: () =>
            gate(async () => {
              context.signal.throwIfAborted();
              const image = await load_image(source.file, source.path);
              try {
                const size = squashed_size({ width: image.bitmap.width, height: image.bitmap.height }, options.max);
                const blob = await encode_image(draw(image.bitmap, size), options.format, options.quality / 100);
                context.signal.throwIfAborted();
                const folder = target_folder(source, run.folder) ?? (await pictures_folder());
                const directory = await files().get_directory(folder);
                if (!directory) throw new Error(`${folder}: no such folder`);
                const handle = await files().create_file(directory, squashed_name(source.name, extension), { content: blob });
                const result = { path: child_path(folder, handle.name), size: blob.size, ...size };
                results[index] = result;
                run.on_result?.(index, result);
                context.message(`${count()} of ${total}`);
              } finally {
                image.bitmap.close();
              }
            }),
        })();
      };
      const pending = sources.flatMap((_, index) => (results[index] ? [] : [index]));
      return createTaskGroup({ name: "Squash", mode: ExecutionMode.PARALLEL, tasks: () => pending.map(squash) })();
    },
    {
      title: `Squashing ${total} ${total === 1 ? "image" : "images"}`,
      signal: run.signal,
      done: () => {
        const written = results.filter((result) => result !== null);
        const before = sources.reduce((sum, source, index) => sum + (results[index] ? source.file.size : 0), 0);
        const after = written.reduce((sum, result) => sum + result.size, 0);
        const folders = new Set(written.map((result) => parent_path(result.path)));
        const [folder] = folders;
        return {
          title: `Squashed ${written.length} ${written.length === 1 ? "image" : "images"}`,
          message: `${format_bytes(before)} → ${format_bytes(after)} (${format_share(saved_share(before, after))})`,
          actions:
            folders.size === 1
              ? [{ label: "Show folder", on_click: () => kernel.service<AppsService>("apps").launch("file-explorer", { path: folder }) }]
              : [],
        };
      },
      failed: (error, cancelled) => {
        const written = results.filter(Boolean).length;
        return {
          title: cancelled ? "Squash cancelled" : "Couldn't squash every image",
          message: [cancelled ? null : error_message(error), written ? `${written} of ${total} written` : null]
            .filter((line) => line !== null)
            .join(" · ") || undefined,
        };
      },
    }
  );
  run.on_job?.(job);
  await job.done;
  return { status: job.status, error: job.error, results };
}
