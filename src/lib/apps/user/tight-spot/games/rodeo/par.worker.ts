import { create_game, type Par, type Round } from "./game";
import { par_of, plan_course } from "./plan";

self.onmessage = ({ data }: MessageEvent<Round>) => {
  const state = create_game(data);
  const found = plan_course(state);
  const par: Par | null = found.fault === null ? par_of(found, state) : null;
  self.postMessage(par);
};
