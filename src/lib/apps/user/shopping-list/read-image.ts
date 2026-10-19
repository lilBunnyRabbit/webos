import kernel, { AiAvailability, AiFeature, type AiService, type TaskJob, type TasksService } from "$lib/core/api";
import { createTask } from "@lilbunnyrabbit/task-manager";
import { APP_ID } from "./data";
import { clean_lines } from "./lines";

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

/** Gemini Nano on this device: reads handwriting and layout better than OCR. Rejects when the model can't. */
export async function read_with_ai(image: Blob, signal: AbortSignal): Promise<string[]> {
  let text = "";
  const messages = [
    { role: "system" as const, content: INSTRUCTIONS },
    {
      role: "user" as const,
      content: [
        { type: "text" as const, value: "List every item on this shopping list." },
        { type: "image" as const, value: image },
      ],
    },
  ];
  for await (const chunk of ai().prompt(messages, { signal })) text += chunk;
  return clean_lines(text);
}

/** tesseract.js in a worker, as a task: the first run downloads about 8 MB, then it works offline. */
export function read_with_ocr(image: Blob): TaskJob<string[]> {
  return kernel.service<TasksService>("tasks").run<string[]>(
    APP_ID,
    (context) =>
      createTask<void, string[]>({
        name: "Read the shopping list",
        async execute() {
          const { recognize } = await import("./ocr");
          const text = await recognize(image, context.signal, {
            progress: (fraction) => this.setProgress(fraction),
            message: (line) => context.message(line),
          });
          return clean_lines(text);
        },
      })(),
    {
      title: "Reading the shopping list",
      done: (lines) => ({ title: "Shopping list read", message: `${lines.length} ${lines.length === 1 ? "line" : "lines"} found` }),
    }
  );
}
