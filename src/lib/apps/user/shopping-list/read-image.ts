import kernel, { AiAvailability, AiFeature, type AiService, type TaskJob, type TasksService } from "$lib/core/api";
import type { Bounds } from "$lib/core/utils/type";
import { createTask } from "@lilbunnyrabbit/task-manager";
import { APP_ID } from "./data";
import { clean_lines } from "./lines";
import { render, upright } from "./photo";

export const ReadMethod = { AI: "ai", OCR: "ocr" } as const;
export type ReadMethod = (typeof ReadMethod)[keyof typeof ReadMethod];

export interface ReviewRow {
  text: string;
  keep: boolean;
}

const ai = () => kernel.service<AiService>("ai");

export function read_method(): ReadMethod {
  return ai().features[AiFeature.PROMPT_IMAGE] === AiAvailability.NO ? ReadMethod.OCR : ReadMethod.AI;
}

const INSTRUCTIONS =
  "You read shopping lists from photos. Reply with the items only, one per line, written as on the list with any amount (like 2x or 500 g). No bullets, numbering, headings or other text. If there's no list in the picture, reply with nothing.";

async function prepared(image: Blob, crop: Bounds | null): Promise<Blob> {
  const bitmap = await upright(image);
  try {
    return await render(bitmap, crop);
  } finally {
    bitmap.close();
  }
}

/** Gemini Nano on this device: reads handwriting and layout better than OCR. Rejects when the model can't. */
export async function read_with_ai(image: Blob, crop: Bounds | null, signal: AbortSignal): Promise<string[]> {
  let text = "";
  const messages = [
    { role: "system" as const, content: INSTRUCTIONS },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, value: "List every item on this shopping list." },
        { type: "image" as const, value: await prepared(image, crop) },
      ],
    },
  ];
  for await (const chunk of ai().prompt(messages, { signal })) text += chunk;
  return clean_lines(text);
}

/**
 * PP-OCRv5 in a worker, as a task: the first run downloads about 17 MB, then it works offline. Words snap to
 * `history` (the purchase history's names) before the built-in grocery words.
 */
export function read_with_ocr(image: Blob, crop: Bounds | null, history: readonly string[]): TaskJob<string[]> {
  return kernel.service<TasksService>("tasks").run<string[]>(
    APP_ID,
    (context) =>
      createTask<void, string[]>({
        name: "Read the shopping list",
        async execute() {
          const { read_list } = await import("./ocr");
          const report = { progress: (fraction: number) => this.setProgress(fraction), message: (line: string) => context.message(line) };
          return read_list(image, crop, context.signal, report, history);
        },
      })(),
    {
      title: "Reading the shopping list",
      done: () => null,
    }
  );
}
