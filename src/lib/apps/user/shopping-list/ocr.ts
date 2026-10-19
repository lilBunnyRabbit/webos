import { createWorker, OEM } from "tesseract.js";
import worker_url from "tesseract.js/dist/worker.min.js?url";
import core_url from "tesseract.js-core/tesseract-core-simd-lstm.wasm.js?url";
import eng_url from "@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz?url";
import slv_url from "@tesseract.js-data/slv/4.0.0_best_int/slv.traineddata.gz?url";

export interface OcrProgress {
  progress(fraction: number): void;
  message(text: string): void;
}

const absolute = (url: string) => new URL(url, location.href).href;

/**
 * tesseract.js 7 can't take language data as bytes (its worker joins `data` instead of `code` into the language name),
 * so it fetches `{langPath}/{code}.traineddata.gz`. Vite hashes each file's name, so this wrapper maps that path onto
 * the bundled files before it loads tesseract's own worker. Everything comes from this site, never a CDN, and the
 * service worker keeps it after the first read (vite.config.ts).
 */
function worker_script(): string {
  const files = { slv: absolute(slv_url), eng: absolute(eng_url) };
  const source = [
    `const files = ${JSON.stringify(files)};`,
    "const original = self.fetch.bind(self);",
    "self.fetch = (input, init) => {",
    "  const match = String(input).match(/\\/(\\w+)\\.traineddata\\.gz$/);",
    "  return original(match && files[match[1]] ? files[match[1]] : input, init);",
    "};",
    `importScripts(${JSON.stringify(absolute(worker_url))});`,
  ].join("\n");
  return URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
}

export async function recognize(image: Blob, signal: AbortSignal, report: OcrProgress): Promise<string> {
  signal.throwIfAborted();
  report.message("Loading the text reader");
  const script = worker_script();
  let worker: Awaited<ReturnType<typeof createWorker>>;
  try {
    worker = await createWorker(["slv", "eng"], OEM.LSTM_ONLY, {
      workerPath: script,
      corePath: absolute(core_url),
      langPath: absolute("/tesseract-data"),
      workerBlobURL: false,
      cacheMethod: "none",
      logger: (event) => {
        if (event.status !== "recognizing text") return;
        report.message("Reading the photo");
        report.progress(event.progress);
      },
      // Without it a failed load also throws from the worker's message handler, outside the awaited promise.
      errorHandler: () => {},
    });
  } finally {
    URL.revokeObjectURL(script);
  }
  const abort = () => void worker.terminate();
  signal.addEventListener("abort", abort, { once: true });
  try {
    signal.throwIfAborted();
    const { data } = await worker.recognize(image);
    signal.throwIfAborted();
    return data.text;
  } finally {
    signal.removeEventListener("abort", abort);
    await worker.terminate().catch(() => {});
  }
}
