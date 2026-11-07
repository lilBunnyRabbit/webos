import { create_game, type Par } from "./game";
import type { Round } from "./levels";
import { par_of, plan_job } from "./plan";

self.onmessage = ({ data }: MessageEvent<Round>) => {
  const state = create_game(data);
  const found = plan_job(state);
  const par: Par | null = found ? par_of(found, state.yard.tasks.length) : null;
  self.postMessage(par);
};
