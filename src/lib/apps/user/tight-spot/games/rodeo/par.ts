import type { Par, Round } from "./game";
import ParWorker from "./par.worker?worker";

export interface ParJob {
  /** Null when the planner finds no way round, which the tests rule out for the levels. */
  result: Promise<Par | null>;
  cancel: () => void;
}

// A trailer level takes the planner several seconds, so the par is worked out off the main thread while the card is up.
export function work_out_par(round: Round): ParJob {
  const worker = new ParWorker();
  const result = new Promise<Par | null>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Par | null>) => resolve(event.data);
    worker.onerror = (event) => reject(new Error(event.message || "The par couldn't be worked out"));
  }).finally(() => worker.terminate());
  worker.postMessage(round);
  return { result, cancel: () => worker.terminate() };
}
