import { measure_round, type Round } from "./game";

self.onmessage = ({ data }: MessageEvent<Round>) => {
  const measured = measure_round(data);
  self.postMessage(measured, { transfer: [measured.coverable.buffer] });
};
