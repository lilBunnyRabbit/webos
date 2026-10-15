import type { AnalysisRequest } from "./analysis.worker";
import AnalysisWorker from "./analysis.worker?worker";
import type { Analysis } from "./puzzle";

export interface AnalysisJob {
  result: Promise<Analysis>;
  /** Stops the worker; `result` then never settles. */
  cancel(): void;
}

export function analyze_off_thread(request: AnalysisRequest): AnalysisJob {
  const worker = new AnalysisWorker();
  const result = new Promise<Analysis>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Analysis>) => resolve(event.data);
    worker.onerror = (event) => reject(new Error(event.message || "The analysis failed"));
  }).finally(() => worker.terminate());
  worker.postMessage(request);
  return { result, cancel: () => worker.terminate() };
}
