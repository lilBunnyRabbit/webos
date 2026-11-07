import type { Chart, RoundRef } from "./rounds";

export interface ChartJob {
  result: Promise<Chart>;
  cancel: () => void;
}

// The autopilot runs the round in the real physics to prove it and set the par: a few hundred ms, more for a seed whose
// first layouts fail, and the coefficients are derived first, so it runs off the main thread while the card is up.
export function work_out_chart<Ref extends RoundRef>(worker: Worker, ref: Ref, failure: string): ChartJob {
  const result = new Promise<Chart>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<Chart>) => resolve(event.data);
    worker.onerror = (event) => reject(new Error(event.message || failure));
  }).finally(() => worker.terminate());
  worker.postMessage(ref);
  return { result, cancel: () => worker.terminate() };
}

export function serve_chart<Ref extends RoundRef>(chart: (ref: Ref) => Chart): void {
  self.onmessage = ({ data }: MessageEvent<Ref>) => {
    self.postMessage(chart(data));
  };
}
