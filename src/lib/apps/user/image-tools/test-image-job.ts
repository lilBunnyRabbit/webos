import { createTask, createTaskGroup } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type FilesService, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { base_name, parent_path } from "$lib/core/api/services/files/path";
import { error_message, format_bytes } from "$lib/core/utils";
import { encode_image, ImageFormat, write_image } from "$lib/core/utils/image";
import { mime_of, Mode, plan_output, TestFormat, type TestImageSpec, type TestOutput } from "./test-image";
import { BmpEncoder, PngStoredEncoder } from "./test-image-encode";
import { render_bands, render_canvas } from "./test-image-render";
import { test_image_svg } from "./test-image-svg";

const files = () => kernel.service<FilesService>("files");

const CANVAS_FORMATS: Partial<Record<TestFormat, ImageFormat>> = {
  [TestFormat.PNG]: ImageFormat.PNG,
  [TestFormat.JPEG]: ImageFormat.JPEG,
  [TestFormat.WEBP]: ImageFormat.WEBP,
};

async function remove(path: string): Promise<void> {
  const folder = await files().get_directory(parent_path(path));
  if (folder) await files().delete_entry(folder, base_name(path)).catch(() => {});
}

export const PICTURES = "/home/Pictures";

export async function pictures_folder(): Promise<string> {
  if (await files().get_directory(PICTURES)) return PICTURES;
  const home = await files().get_directory(parent_path(PICTURES));
  if (!home) throw new Error("The home folder is missing.");
  await files().create_directory(home, base_name(PICTURES));
  return PICTURES;
}

export type TestImageResult =
  | { ok: true; path: string; width: number; height: number; size: number }
  | { ok: false; error: string };

// Bands go into Blobs (the browser spills them to disk past its memory limit) and reach `path` in one write at the end,
// so a cancelled run leaves nothing behind.
export async function generate_test_image(
  app_id: AppId,
  spec: TestImageSpec,
  output: TestOutput,
  path: string,
  signal?: AbortSignal
): Promise<TestImageResult> {
  const plan = plan_output(spec, output);
  if (!plan.ok) throw new Error(plan.error);
  const sized: TestImageSpec = { ...spec, width: plan.width, height: plan.height };
  if (plan.bytes !== null) {
    const { usage, quota } = await files().get_storage_estimate();
    if (plan.bytes > quota - usage)
      throw new Error(`Not enough storage: needs ${format_bytes(plan.bytes)}, ${format_bytes(Math.max(0, quota - usage))} free`);
  }
  const existed = (await files().get_file(path)) !== null;
  const { format } = output;
  const name = base_name(path);
  let size = 0;

  const job = kernel.service<TasksService>("tasks").run(
    app_id,
    (context) => {
      let blob: Blob | null = null;
      const write = createTask<void, void>({
        name: "Write file",
        async execute() {
          context.signal.throwIfAborted();
          context.message(`Writing ${name}`);
          try {
            await write_image(path, blob!);
          } catch (error) {
            if (!existed) await remove(path);
            throw error;
          }
          size = blob!.size;
          this.logger.info(`${path} · ${format_bytes(size)}`);
        },
      });

      let steps: (() => ReturnType<typeof write>)[];
      if (plan.mode === Mode.STREAM) {
        const total = plan.bytes!;
        steps = [
          createTask<void, void>({
            name: `Render ${sized.width} × ${sized.height}`,
            parse: () => ({ status: `${plan.note} · ${format_bytes(total)}` }),
            async execute() {
              context.signal.throwIfAborted();
              const encoder =
                format === TestFormat.BMP
                  ? new BmpEncoder(sized.width, sized.height, plan.pad)
                  : new PngStoredEncoder(sized.width, sized.height, plan.pad);
              const parts: Blob[] = [];
              let done = 0;
              const add = (chunks: Uint8Array[]) => {
                for (const chunk of chunks) {
                  parts.push(new Blob([chunk as BlobPart]));
                  done += chunk.length;
                }
              };
              add(encoder.header());
              let rows = 0;
              for await (const band of render_bands(sized, format, context)) {
                add(encoder.push(band.rgb));
                rows += band.rows;
                this.setProgress(rows / sized.height);
                context.message(`${format_bytes(done)} of ${format_bytes(total)}`);
              }
              add(encoder.finish());
              if (done !== total) throw new Error(`Wrote ${done} bytes, expected ${total}`);
              blob = new Blob(parts, { type: mime_of(format) });
              this.logger.info(`${parts.length} chunks, ${format_bytes(done)}`);
            },
          }),
          write,
        ];
      } else if (plan.mode === Mode.CANVAS) {
        let canvas: OffscreenCanvas | null = null;
        steps = [
          createTask<void, void>({
            name: `Render ${sized.width} × ${sized.height}`,
            async execute() {
              context.signal.throwIfAborted();
              canvas = render_canvas(sized, format);
            },
          }),
          createTask<void, void>({
            name: `Encode ${format.toUpperCase()}`,
            async execute() {
              context.signal.throwIfAborted();
              blob = await encode_image(canvas!, CANVAS_FORMATS[format]!, output.quality / 100);
              canvas = null;
              this.logger.info(format_bytes(blob.size));
            },
          }),
          write,
        ];
      } else {
        steps = [
          createTask<void, void>({
            name: "Build SVG",
            async execute() {
              context.signal.throwIfAborted();
              blob = new Blob([test_image_svg(sized)], { type: mime_of(format) });
              this.logger.info(format_bytes(blob.size));
            },
          }),
          write,
        ];
      }
      return createTaskGroup({ name: `Test image ${name}`, tasks: () => steps.map((step) => step()) })();
    },
    {
      title: `Generating ${name}`,
      signal,
      done: () => ({
        title: "Test image saved",
        message: `${path} · ${format_bytes(size)}`,
        actions: [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(path) }],
      }),
      failed: (error, cancelled) => ({
        title: cancelled ? "Test image cancelled" : "Couldn't generate the test image",
        message: cancelled ? "Nothing was saved" : error_message(error),
      }),
    }
  );
  await job.done;
  if (job.status === TaskJobStatus.DONE) return { ok: true, path, width: sized.width, height: sized.height, size };
  return { ok: false, error: job.status === TaskJobStatus.CANCELLED ? "stopped" : (job.error ?? "failed") };
}
