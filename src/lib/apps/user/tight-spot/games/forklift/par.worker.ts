import { create_game, type Par, type Round } from "./game";
import { par_of, plan_job, racked } from "./plan";

self.onmessage = ({ data }: MessageEvent<Round>) => {
  const state = create_game(data);
  const found = plan_job(state);
  const par: Par | null = found ? par_of(found, data.size, racked(state)) : null;
  self.postMessage(par);
};
