import { create_game, type Round } from "./game";
import { job_par } from "./plan";

self.onmessage = ({ data }: MessageEvent<Round>) => {
  self.postMessage(job_par(create_game(data)));
};
