import { createTask, createTaskGroup, ExecutionMode } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type TasksService } from "$lib/core/api";
import { base_name } from "$lib/core/api/services/files/path";
import { format_bytes } from "$lib/core/utils";
import { composite } from "./composite";
import { gif_delays, gif_frame, gif_header, GIF_TRAILER, scale_indices, type GifHeader } from "$kit/utils/codecs/gif";
import { write_text } from "./io";
import type { Direction, Sprite } from "./model";
import { index_pixels } from "./quantize";
import { frame_sequence, type FrameRange } from "./sequence";
import { animated_svg, dedupe_frames, frame_body, static_svg, type AnimationStep } from "./svg";

export interface AnimationExport {
  scale: number;
  range: FrameRange;
  direction: Direction;
  loop: boolean;
}

export const MAX_GIF_SIDE = 4096;

export function gif_scales(sprite: Sprite, scales: readonly number[]): number[] {
  return scales.filter((scale) => scale === 1 || Math.max(sprite.width, sprite.height) * scale <= MAX_GIF_SIDE);
}

function same(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function frame_svg(sprite: Sprite, frame: number, scale: number): string {
  return static_svg(composite(sprite, frame), sprite.width, sprite.height, scale);
}

export async function write_frame_svg(path: string, sprite: Sprite, frame: number, scale: number): Promise<void> {
  await write_text(path, new Blob([frame_svg(sprite, frame, scale)], { type: "image/svg+xml" }));
}

export async function write_animated_svg(app_id: string, path: string, sprite: Sprite, options: AnimationExport, on_done?: () => void): Promise<boolean> {
  const order = frame_sequence(options.range, options.direction);
  const name = base_name(path);
  const apps = () => kernel.service<AppsService>("apps");

  const job = kernel.service<TasksService>("tasks").run<void>(
    app_id,
    (context) => {
      const images: Uint8ClampedArray[] = [];
      const render = createTask<number, void>({
        name: "Frame",
        parse() {
          return { status: `Frame ${this.data + 1}` };
        },
        async execute(frame) {
          context.signal.throwIfAborted();
          images.push(composite(sprite, frame));
          this.setProgress(1);
          context.message(`Frame ${images.length} of ${order.length}`);
          await context.pace();
        },
      });
      const write = createTask<void, void>({
        name: "Write file",
        async execute() {
          context.signal.throwIfAborted();
          const firsts = dedupe_frames(images);
          const unique = [...new Set(firsts)];
          const slot = new Map(unique.map((first, i) => [first, i]));
          const bodies = unique.map((first) => frame_body(images[first], sprite.width, sprite.height));
          const steps: AnimationStep[] = order.map((frame, i) => ({ frame: slot.get(firsts[i])!, duration: sprite.frames[frame].duration }));
          this.logger.info(`${order.length} frames, ${unique.length} unique`);
          const svg = animated_svg({ width: sprite.width, height: sprite.height, scale: options.scale, bodies, steps, loop: options.loop });
          await write_text(path, new Blob([svg], { type: "image/svg+xml" }));
          this.setProgress(1);
        },
      });
      return createTaskGroup({
        name: `Export ${name}`,
        mode: ExecutionMode.SEQUENTIAL,
        tasks: () => [...order.map((frame) => render(frame)), write()],
      })();
    },
    {
      title: `Exporting ${name}`,
      done: () => {
        on_done?.();
        return { title: "Animation exported", message: path, actions: [{ label: "Open", on_click: () => void apps().open(path) }] };
      },
    }
  );
  await job.done;
  return job.status === TaskJobStatus.DONE;
}

export interface GifExport {
  scale: number;
  order: number[];
  loop: boolean;
}

/** Indexes every frame against one growing palette, so the sprite's own colours keep their exact entries. */
export async function write_gif(app_id: string, path: string, sprite: Sprite, options: GifExport, on_done?: () => void): Promise<boolean> {
  const { order, scale } = options;
  const name = base_name(path);
  const apps = () => kernel.service<AppsService>("apps");

  const job = kernel.service<TasksService>("tasks").run<void>(
    app_id,
    (context) => {
      let palette: string[] = [...sprite.palette];
      let approximated = 0;
      const frames: { indices: Uint8Array; duration: number }[] = [];
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let header: GifHeader | null = null;

      const index = createTask<number, void>({
        name: "Frame",
        parse() {
          return { status: `Frame ${this.data + 1}` };
        },
        async execute(frame) {
          context.signal.throwIfAborted();
          const indexed = index_pixels(composite(sprite, frame), palette);
          palette = indexed.palette;
          approximated += indexed.approximated;
          const duration = sprite.frames[frame].duration;
          const previous = frames.at(-1);
          if (previous && same(previous.indices, indexed.data)) previous.duration += duration;
          else frames.push({ indices: indexed.data, duration });
          this.setProgress(1);
          context.message(`Frame ${frames.length} of ${order.length}`);
          await context.pace();
        },
      });
      const encode = createTask<void, void>({
        name: "Encode",
        async execute() {
          header = { width: sprite.width * scale, height: sprite.height * scale, palette, transparent: 0, loop: options.loop && frames.length > 1 };
          const delays = gif_delays(frames.map((frame) => frame.duration));
          this.logger.info(`${frames.length} frames after merging repeats, ${palette.length} colours`);
          if (approximated) this.logger.warn(`${approximated} blended colours didn't fit 256 and use the nearest one`);
          for (let i = 0; i < frames.length; i++) {
            context.signal.throwIfAborted();
            const indices = scale_indices(frames[i].indices, sprite.width, sprite.height, scale);
            chunks.push(gif_frame(header, { indices, delay: delays[i] }));
            this.setProgress((i + 1) / frames.length);
            context.message(`Encoding ${i + 1} of ${frames.length}`);
            await context.pace();
          }
        },
      });
      const write = createTask<void, void>({
        name: "Write file",
        async execute() {
          context.signal.throwIfAborted();
          const blob = new Blob([gif_header(header!), ...chunks, GIF_TRAILER], { type: "image/gif" });
          this.logger.info(`Saved ${format_bytes(blob.size)}`);
          await write_text(path, blob);
          this.setProgress(1);
        },
      });
      return createTaskGroup({
        name: `Export ${name}`,
        mode: ExecutionMode.SEQUENTIAL,
        tasks: () => [...order.map((frame) => index(frame)), encode(), write()],
      })();
    },
    {
      title: `Exporting ${name}`,
      done: () => {
        on_done?.();
        return { title: "GIF exported", message: path, actions: [{ label: "Open", on_click: () => void apps().open(path) }] };
      },
    }
  );
  await job.done;
  return job.status === TaskJobStatus.DONE;
}
