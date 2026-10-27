import type { Quad } from "$kit/utils/perspective";
import type { OcrReply, OcrRequest } from "./ocr.worker";

export interface OcrProgress {
  progress(fraction: number): void;
  message(text: string): void;
}

/**
 * Reads the list in `crop` (upright pixels, `null` for all) with PP-OCRv5 in a worker. A poor read is tried turned too,
 * and the most confident one wins. Words snap to `history` first, then to the built-in grocery words.
 */
export async function read_list(image: Blob, crop: Quad | null, signal: AbortSignal, report: OcrProgress, history: readonly string[]): Promise<string[]> {
  signal.throwIfAborted();
  const worker = new Worker(new URL("./ocr.worker.ts", import.meta.url), { type: "module", name: "shopping-list-ocr" });
  return await new Promise<string[]>((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    worker.onerror = (event) => reject(new Error(event.message || "The text reader didn't start"));
    worker.onmessage = ({ data }: MessageEvent<OcrReply>) => {
      if (data.type === "message") report.message(data.text);
      else if (data.type === "progress") report.progress(data.fraction);
      else if (data.type === "done") resolve(data.lines);
      else reject(new Error(data.message));
    };
    worker.postMessage({ image, crop, history: [...history] } satisfies OcrRequest);
  }).finally(() => worker.terminate());
}
