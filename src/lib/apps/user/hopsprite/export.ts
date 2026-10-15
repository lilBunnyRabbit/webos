import { createTask, createTaskGroup, ExecutionMode } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type AppsService, type TasksService } from "$lib/core/api";
import { base_name } from "$lib/core/api/services/files/path";
import { composite } from "./composite";
import { write_text } from "./io";
import type { Direction, Sprite } from "./model";
import { frame_sequence, type FrameRange } from "./sequence";
import { animated_svg, dedupe_frames, frame_body, static_svg, type AnimationStep } from "./svg";

export interface AnimationExport {
  scale: number;
  range: FrameRange;
  direction: Direction;
  loop: boolean;
}

export function frame_svg(sprite: Sprite, frame: number, scale: number): string {
  return static_svg(composite(sprite, frame), sprite.width, sprite.height, scale);
}

export async function write_frame_svg(path: string, sprite: Sprite, frame: number, scale: number): Promise<void> {
  await write_text(path, new Blob([frame_svg(sprite, frame, scale)], { type: "image/svg+xml" }));
}

export async function write_animated_svg(app_id: string, path: string, sprite: Sprite, options: AnimationExport): Promise<boolean> {
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
      done: () => ({ title: "Animation exported", message: path, actions: [{ label: "Open", on_click: () => void apps().open(path) }] }),
    }
  );
  await job.done;
  return job.status === TaskJobStatus.DONE;
}
