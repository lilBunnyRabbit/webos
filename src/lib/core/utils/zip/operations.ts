import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, {
  NotificationType,
  TaskJobStatus,
  type AppsService,
  type FilesService,
  type NotificationsService,
  type TaskContext,
  type TaskJob,
  type TaskReport,
  type TasksService,
} from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { error_message, format_bytes } from "$lib/core/utils";
import { extract_entries, item_at, join, remove_at, write_at, type ExtractResult } from "./files";
import { add_item, archive_name, base_name, stem, unique_name, type CreateItem } from "./create";
import { Method, type StreamOptions } from "./format";
import { read_zip, type ZipEntry } from "./read";
import { ZipWriter } from "./write";

// Explorer's Compress and Extract here are an OS feature, so their notifications come from it unless a caller names its app.
const SENDER: AppId = "file-explorer";

export interface RunOptions {
  app_id?: AppId;
  signal?: AbortSignal;
  on_job?: (job: TaskJob | null) => void;
}

interface Leftover {
  path: string;
  discard: () => Promise<void>;
}

const files = () => kernel.service<FilesService>("files");
const apps = () => kernel.service<AppsService>("apps");
const tasks = () => kernel.service<TasksService>("tasks");
const notifications = () => kernel.service<NotificationsService>("notifications");

function stream(task: { setProgress(progress: number): unknown }, context: TaskContext, total: number): StreamOptions {
  let done = 0;
  return {
    signal: context.signal,
    pace: context.pace,
    on_bytes: (bytes) => {
      done += bytes;
      task.setProgress(total > 0 ? done / total : 0);
      context.message(`${format_bytes(done)} of ${format_bytes(total)}`);
    },
  };
}

async function discard(app_id: AppId, leftover: Leftover): Promise<void> {
  try {
    await leftover.discard();
    notifications().notify(app_id, { title: "Discarded", message: leftover.path });
  } catch (error) {
    notifications().notify(app_id, {
      type: NotificationType.ERROR,
      title: "Couldn't discard",
      message: error_message(error),
    });
  }
}

// A half-written archive or folder stays where it was written until the user picks Discard or Keep.
function failed(app_id: AppId, texts: { cancelled: string; failed: string }, leftover: () => Leftover | null) {
  return (error: unknown, cancelled: boolean): TaskReport => {
    const left = leftover();
    const lines = [cancelled ? null : error_message(error), left ? `Already written: ${left.path}` : null].filter(
      (line) => line !== null
    );
    return {
      title: cancelled ? texts.cancelled : texts.failed,
      message: lines.join(" · ") || undefined,
      actions: left
        ? [
            { label: "Discard", on_click: () => void discard(app_id, left) },
            { label: "Keep", on_click: () => {} },
          ]
        : [],
    };
  };
}

async function tracked<T>(job: TaskJob<T>, options: RunOptions): Promise<T | null> {
  options.on_job?.(job);
  try {
    return await job.done;
  } finally {
    options.on_job?.(null);
  }
}

export async function items_at(paths: string[]): Promise<CreateItem[]> {
  let items: CreateItem[] = [];
  for (const path of paths) {
    const item = await item_at(path);
    if (!item) throw new Error(`${path}: no such file or folder`);
    items = add_item(items, item);
  }
  return items;
}

export async function free_path(folder: string, name: string): Promise<string> {
  const directory = await files().get_directory(folder);
  if (!directory) throw new Error(`${folder}: no such folder`);
  const taken = new Set((await files().list(directory)).map((item) => item.name));
  return join(folder, unique_name(name, taken));
}

/**
 * One task per picked file or folder, then one that writes the archive: a sequential group, since the writer appends
 * entries in order.
 */
export async function zip_items(items: CreateItem[], target: string, method: Method = Method.DEFLATE, options: RunOptions = {}): Promise<string | null> {
  const app_id = options.app_id ?? SENDER;
  const existed = (await files().get_file(target)) !== null;
  const total = items.reduce((sum, item) => sum + item.size, 0);
  let leftover: Leftover | null = null;
  let size = 0;
  const job = tasks().run(
    app_id,
    (context) => {
      const writer = new ZipWriter(method);
      let done = 0;
      const add = (item: CreateItem) =>
        createTask<void, void>({
          name: item.directory ? `${item.name}/` : item.name,
          parse() {
            if (item.directory) return { status: `${item.files} ${item.files === 1 ? "file" : "files"} · ${format_bytes(item.size)}` };
            return { status: format_bytes(item.size) };
          },
          async execute() {
            let mine = 0;
            const stream: StreamOptions = {
              signal: context.signal,
              pace: context.pace,
              on_bytes: (bytes) => {
                mine += bytes;
                done += bytes;
                this.setProgress(item.size > 0 ? mine / item.size : 0);
                context.message(`${format_bytes(done)} of ${format_bytes(total)}`);
              },
            };
            for (const source of item.sources) await writer.add(source, stream);
            this.logger.info(`Packed ${item.sources.length} ${item.sources.length === 1 ? "entry" : "entries"}`);
          },
        })();
      const write = createTask<void, string>({
        name: "Write archive",
        async execute() {
          leftover = null;
          context.message(`Writing ${base_name(target)}`);
          const zip = writer.finish();
          if (!existed) leftover = { path: target, discard: () => remove_at(target) };
          await write_at(target, zip);
          size = zip.size;
          context.message(null);
          this.logger.info(`${target} · ${format_bytes(zip.size)}`);
          return target;
        },
      });
      return createTaskGroup({ name: `Compress ${base_name(target)}`, tasks: () => [...items.map(add), write()] })();
    },
    {
      title: `Compressing ${base_name(target)}`,
      signal: options.signal,
      done: () => ({
        title: "Archive saved",
        message: `${target} · ${format_bytes(size)}`,
        actions: [{ label: "Open", on_click: () => void apps().open(target) }],
      }),
      failed: failed(app_id, { cancelled: "Compression cancelled", failed: "Couldn't create the archive" }, () => leftover),
    }
  );
  // The root is a group, which has no result of its own.
  await tracked(job, options);
  return job.status === TaskJobStatus.DONE ? target : null;
}

export async function compress_into(paths: string[], folder: string): Promise<string | null> {
  const items = await items_at(paths);
  return zip_items(items, await free_path(folder, archive_name(items)));
}

export async function extract_blob(
  blob: Blob,
  name: string,
  entries: ZipEntry[],
  folder: string,
  options: RunOptions = {}
): Promise<ExtractResult | null> {
  const app_id = options.app_id ?? SENDER;
  const total = entries.reduce((sum, entry) => sum + (entry.directory ? 0 : entry.size), 0);
  let leftover: Leftover | null = null;
  const job = tasks().run<ExtractResult>(
    app_id,
    (context) =>
      createTask<void, ExtractResult>({
        name: "Extract",
        execute() {
          leftover = null;
          return extract_entries(blob, entries, folder, stem(name), stream(this, context, total), (path) => {
            leftover = { path, discard: () => remove_at(path) };
          });
        },
      })(),
    {
      title: `Extracting ${name}`,
      signal: options.signal,
      done: (result) => ({
        title: `Extracted ${result.files} ${result.files === 1 ? "file" : "files"}`,
        message: `${result.path}${result.skipped.length ? ` · ${result.skipped.length} skipped (encrypted or unsupported)` : ""}`,
        actions: [{ label: "Show folder", on_click: () => apps().launch("file-explorer", { path: result.path }) }],
      }),
      failed: failed(
        app_id,
        { cancelled: "Extraction cancelled", failed: "Couldn't extract the archive" },
        () => leftover
      ),
    }
  );
  return tracked(job, options);
}

export async function extract_to(
  path: string,
  folder: string,
  options: RunOptions = {}
): Promise<ExtractResult | null> {
  const file = await files().get_file(path);
  if (!file) throw new Error(`${path}: no such file`);
  const archive = await read_zip(file);
  return extract_blob(file, base_name(path), archive.entries, folder, options);
}
