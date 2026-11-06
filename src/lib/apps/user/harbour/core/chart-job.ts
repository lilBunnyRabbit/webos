import type { Chart, RoundRef } from "./rounds";
import ChartWorker from "./chart.worker?worker";

export interface ChartJob {
  result: Promise<Chart>;
  cancel: () => void;
}

// The autopilot docks the round in the real physics to prove it and set the par: a few hundred ms, more for a seed
// whose first layouts fail, so it runs off the main thread while the start card is up.
export function work_out_chart(ref: RoundRef): ChartJob {
  const worker = new ChartWorker();
  const result = new Promise<Chart>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Chart>) => resolve(event.data);
    worker.onerror = (event) => reject(new Error(event.message || "The berth couldn't be charted"));
  }).finally(() => worker.terminate());
  worker.postMessage(ref);
  return { result, cancel: () => worker.terminate() };
}
