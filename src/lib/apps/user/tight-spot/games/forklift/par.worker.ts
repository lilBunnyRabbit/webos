import { create_game, type Par, type Round } from "./game";
import { par_of, plan_job } from "./plan";

self.onmessage = ({ data }: MessageEvent<Round>) => {
  const found = plan_job(create_game(data));
  const par: Par | null = found ? par_of(found, data.size) : null;
  self.postMessage(par);
};
