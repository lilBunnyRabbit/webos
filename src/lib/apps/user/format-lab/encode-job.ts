import { createTask, createTaskGroup, ExecutionMode } from "@lilbunnyrabbit/task-manager";
import kernel, { type TaskJob, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { format_bytes } from "$lib/core/utils";
import { compare, decode, encode, type SsimResult } from "$kit/utils/codecs";
import { CODECS, type CodecFormat, type EncodeOptions } from "$kit/utils/codecs/formats";

export interface LabResult {
  format: CodecFormat;
  key: string;
  blob: Blob;
  ms: number;
  ssim: SsimResult;
  bitmap: ImageBitmap;
}

export interface LabRun {
  app_id: AppId;
  name: string;
  image: ImageData;
  formats: { format: CodecFormat; options: EncodeOptions }[];
  on_result: (result: LabResult) => void;
}

export function settings_key(options: EncodeOptions): string {
  return `${options.lossless ? "lossless" : options.quality}|${options.effort ?? ""}`;
}

export function describe_options(format: CodecFormat, options: EncodeOptions): string {
  const effort = CODECS[format].effort;
  if (options.lossless) return effort ? `lossless · ${effort.label.toLowerCase()} ${options.effort}` : "lossless";
  return [`quality ${options.quality}`, effort && `${effort.label.toLowerCase()} ${options.effort}`].filter(Boolean).join(" · ");
}

export function run_lab(run: LabRun): TaskJob {
  const { image, formats } = run;
  const done = new Map<CodecFormat, LabResult>();
  const labels = formats.map(({ format }) => CODECS[format].label);

  return kernel.service<TasksService>("tasks").run(
    run.app_id,
    (context) => {
      const step = (format: CodecFormat, options: EncodeOptions) =>
        createTask<void, void>({
          name: CODECS[format].label,
          parse() {
            const result = done.get(format);
            if (!result) return { status: describe_options(format, options) };
            return { status: `${format_bytes(result.blob.size)} · SSIM ${result.ssim.score.toFixed(4)}` };
          },
          async execute() {
            const { signal } = context;
            signal.throwIfAborted();
            const { blob, ms } = await encode(format, image, options, { signal });
            this.setProgress(0.6);
            const decoded = await decode(blob, { signal });
            this.setProgress(0.8);
            const ssim = await compare(image, decoded, { signal });
            const bitmap = await createImageBitmap(decoded);
            const result = { format, key: settings_key(options), blob, ms, ssim, bitmap };
            done.set(format, result);
            this.logger.info(`${format_bytes(blob.size)} in ${Math.round(ms)} ms`);
            context.message(`${done.size} of ${formats.length}`);
            run.on_result(result);
          },
        })();
      const pending = formats.filter(({ format }) => !done.has(format));
      return createTaskGroup({
        name: "Encode",
        mode: ExecutionMode.PARALLEL,
        tasks: () => pending.map(({ format, options }) => step(format, options)),
      })();
    },
    {
      title: `Encoding ${run.name} as ${labels.join(", ")}`,
      done: () => ({ title: "Encoded", message: `${run.name} as ${labels.join(", ")}` }),
    }
  );
}
