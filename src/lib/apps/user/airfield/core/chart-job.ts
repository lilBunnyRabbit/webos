import type { Chart, RoundRef } from "./rounds";
import ChartWorker from "./chart.worker?worker";

export interface ChartJob {
  result: Promise<Chart>;
  cancel: () => void;
}

// The autopilot flies the round in the real physics to prove it and set the par: up to a few hundred ms, more for a
// seed whose first layouts fail, and the coefficients are derived first, so it runs off the main thread while the card is up.
export function work_out_chart(ref: RoundRef): ChartJob {
  const worker = new ChartWorker();
  const result = new Promise<Chart>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Chart>) => resolve(event.data);
    worker.onerror = (event) => reject(new Error(event.message || "The round couldn't be flown"));
  }).finally(() => worker.terminate());
  worker.postMessage(ref);
  return { result, cancel: () => worker.terminate() };
}
