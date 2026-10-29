import type { Measured, Round } from "./game";
import MeasureWorker from "./measure.worker?worker";

export interface MeasureJob {
  result: Promise<Measured>;
  cancel: () => void;
}

// Flooding the lattice takes a few hundred milliseconds on a big garden: off the main thread, while the card is up.
export function work_out_lawn(round: Round): MeasureJob {
  const worker = new MeasureWorker();
  const result = new Promise<Measured>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Measured>) => resolve(event.data);
    worker.onerror = (event) => reject(new Error(event.message || "The lawn couldn't be measured"));
  }).finally(() => worker.terminate());
  worker.postMessage(round);
  return { result, cancel: () => worker.terminate() };
}
