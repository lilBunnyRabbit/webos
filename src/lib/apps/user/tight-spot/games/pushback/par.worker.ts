import { create_game, type Par, type Round } from "./game";
import { par_of, plan_push } from "./plan";

self.onmessage = ({ data }: MessageEvent<Round>) => {
  const found = plan_push(create_game(data));
  const par: Par | null = found ? par_of(found) : null;
  self.postMessage(par);
};
