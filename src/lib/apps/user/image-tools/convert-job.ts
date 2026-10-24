import { createTask, createTaskGroup, ExecutionMode } from "@lilbunnyrabbit/task-manager";
import kernel, { TaskJobStatus, type TaskJob, type TasksService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { error_message, format_bytes } from "$lib/core/utils";
import { Method } from "$lib/core/utils/zip/format";
import { write_zip } from "$lib/core/utils/zip/write";
import { ENCODERS } from "$kit/utils/codecs/encoders";
import { ENCODER_FORMATS, type EncoderFormat } from "$kit/utils/codecs/formats";
import { has_alpha, read_image } from "$kit/utils/codecs/source";
import { converted_name, convert_warnings, type ConvertSource } from "./convert";
import { is_animated, type FitSource } from "./fit-job";

export interface ConvertCard {
  format: EncoderFormat;
  blob: Blob | null;
  /** Why this one format couldn't be written; the others still are. */
  error: string | null;
  warnings: string[];
}

export interface ConvertOutcome {
  status: TaskJobStatus;
  error: string | null;
  source: (ConvertSource & { animated: boolean }) | null;
  cards: ConvertCard[];
}

export interface ConvertRunOptions {
  signal?: AbortSignal;
  on_job?: (job: TaskJob) => void;
  on_source?: (source: ConvertSource & { animated: boolean }) => void;
  on_card?: (card: ConvertCard) => void;
}

/** One task: read the image, then a sub-task per format in parallel; the codec worker pool caps how many run at once. */
export async function convert_all(app_id: AppId, source: FitSource, options: ConvertRunOptions = {}): Promise<ConvertOutcome> {
  const cards = new Map<EncoderFormat, ConvertCard>();
  const state: { read: { image: ImageData; info: ConvertSource & { animated: boolean } } | null } = { read: null };

  const job = kernel.service<TasksService>("tasks").run(
    app_id,
    (context) => {
      const reading = createTask<void, void>({
        name: "Read",
        async execute() {
          if (state.read) return;
          const image = await read_image(source.file, context.signal);
          const info = {
            size: source.file.size,
            width: image.width,
            height: image.height,
            alpha: has_alpha(image),
            animated: await is_animated(source.file),
          };
          state.read = { image, info };
          options.on_source?.(info);
        },
      });
      const encode = (format: EncoderFormat) =>
        createTask<void, void>({
          name: ENCODERS[format].label,
          parse() {
            const card = cards.get(format);
            if (!card) return undefined;
            return { status: card.blob ? format_bytes(card.blob.size) : (card.error ?? "") };
          },
          async execute() {
            if (cards.get(format)?.blob) return;
            const { image, info } = state.read!;
            let card: ConvertCard;
            try {
              const blob = await ENCODERS[format].encode(image, { signal: context.signal });
              card = { format, blob, error: null, warnings: convert_warnings(format, info, blob.size) };
            } catch (error) {
              context.signal.throwIfAborted();
              this.logger.warn(`${ENCODERS[format].label}: ${error_message(error)}`);
              card = { format, blob: null, error: error_message(error), warnings: [] };
            }
            cards.set(format, card);
            options.on_card?.(card);
            context.message(`${[...cards.values()].filter((item) => item.blob).length} of ${ENCODER_FORMATS.length}`);
          },
        })();
      return createTaskGroup({
        name: "Convert",
        tasks: () => [
          reading(),
          createTaskGroup({ name: "Formats", mode: ExecutionMode.PARALLEL, tasks: () => ENCODER_FORMATS.map(encode) })(),
        ],
      })();
    },
    {
      title: `Converting ${source.name} to every format`,
      signal: options.signal,
      done: () => null,
      failed: (error, cancelled) => ({
        title: cancelled ? "Convert cancelled" : `Couldn't convert ${source.name}`,
        message: cancelled ? undefined : error_message(error),
      }),
    }
  );
  options.on_job?.(job);
  await job.done;
  return {
    status: job.status,
    error: job.error,
    source: state.read?.info ?? null,
    cards: ENCODER_FORMATS.flatMap((format) => {
      const card = cards.get(format);
      return card ? [card] : [];
    }),
  };
}

export function zip_cards(name: string, cards: ConvertCard[]): Promise<Blob> {
  const modified = new Date();
  return write_zip(
    cards.flatMap((card) => (card.blob ? [{ name: converted_name(name, card.format), data: card.blob, modified }] : [])),
    { method: Method.DEFLATE }
  );
}
