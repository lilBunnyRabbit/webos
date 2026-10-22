import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type FilesService, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { parent_path } from "$lib/core/api/services/files/path";
import { error_message, format_bytes } from "$lib/core/utils";
import { encode } from "$kit/utils/codecs";
import { CODECS, type CodecFormat, type EncodeOptions } from "$kit/utils/codecs/formats";
import { read_image } from "$kit/utils/codecs/source";
import { converted_name, is_image_name } from "./source";

const files = () => kernel.service<FilesService>("files");

export const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

export interface ConvertRun {
  app_id: AppId;
  paths: string[];
  format: CodecFormat;
  options: EncodeOptions;
  /** `null` writes beside each source. */
  folder: string | null;
  signal?: AbortSignal;
}

export interface ConvertOutcome {
  status: TaskJobStatus;
  error: string | null;
  written: string[];
}

export async function images_in(folder: string): Promise<string[]> {
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`${folder}: no such folder`);
  return (await files().list(directory))
    .filter((item) => item.kind === "file" && is_image_name(item.name))
    .map((item) => child_path(folder, item.name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

export async function write_free(folder: string, name: string, content: Blob): Promise<string> {
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`${folder}: no such folder`);
  const handle = await files().create_file(directory, name, { content });
  return child_path(folder, handle.name);
}

// One image at a time: a decoded photo is width × height × 4 bytes, and an AVIF encode holds several times that.
export async function convert_images(run: ConvertRun): Promise<ConvertOutcome> {
  const { paths, format, options } = run;
  const written: (string | null)[] = paths.map(() => null);
  const sizes: ({ before: number; after: number } | null)[] = paths.map(() => null);
  const label = CODECS[format].label;
  const total = paths.length;

  const job = kernel.service<TasksService>("tasks").run(
    run.app_id,
    (context) => {
      const convert = (index: number) => {
        const path = paths[index];
        return createTask<void, void>({
          name: path.slice(path.lastIndexOf("/") + 1),
          parse() {
            const size = sizes[index];
            return size ? { status: `${format_bytes(size.before)} → ${format_bytes(size.after)}` } : undefined;
          },
          async execute() {
            const { signal } = context;
            signal.throwIfAborted();
            const file = await files().get_file(path);
            if (!file) throw new Error(`${path}: no such file`);
            const image = await read_image(file, signal);
            this.setProgress(0.3);
            const { blob } = await encode(format, image, options, { signal });
            signal.throwIfAborted();
            const folder = run.folder ?? parent_path(path);
            written[index] = await write_free(folder, converted_name(file.name, format), blob);
            sizes[index] = { before: file.size, after: blob.size };
            context.message(`${written.filter(Boolean).length} of ${total}`);
          },
        })();
      };
      const pending = paths.flatMap((_, index) => (written[index] ? [] : [index]));
      return createTaskGroup({ name: "Convert", tasks: () => pending.map(convert) })();
    },
    {
      title: `Converting ${total} ${total === 1 ? "image" : "images"} to ${label}`,
      signal: run.signal,
      done: () => {
        const list = written.filter((path) => path !== null);
        const before = sizes.reduce((sum, size) => sum + (size?.before ?? 0), 0);
        const after = sizes.reduce((sum, size) => sum + (size?.after ?? 0), 0);
        const folders = new Set(list.map(parent_path));
        const [folder] = folders;
        return {
          title: `Converted ${list.length} ${list.length === 1 ? "image" : "images"} to ${label}`,
          message: `${format_bytes(before)} → ${format_bytes(after)}`,
          actions:
            folders.size === 1
              ? [{ label: "Show folder", on_click: () => kernel.service<AppsService>("apps").launch("file-explorer", { path: folder }) }]
              : [],
        };
      },
      failed: (error, cancelled) => {
        const count = written.filter(Boolean).length;
        return {
          title: cancelled ? "Convert cancelled" : "Couldn't convert every image",
          message:
            [cancelled ? null : error_message(error), count ? `${count} of ${total} written` : null].filter((line) => line !== null).join(" · ") ||
            undefined,
        };
      },
    }
  );
  await job.done;
  return { status: job.status, error: job.error, written: written.filter((path) => path !== null) };
}
