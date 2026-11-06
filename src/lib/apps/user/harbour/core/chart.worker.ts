import { chart, type RoundRef } from "./rounds";

self.onmessage = ({ data }: MessageEvent<RoundRef>) => {
  self.postMessage(chart(data));
};
