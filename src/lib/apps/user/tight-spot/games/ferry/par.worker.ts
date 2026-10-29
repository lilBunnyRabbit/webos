import { spawn_pose } from "./deck";
import { deck_for, type Par, type Round } from "./game";
import { par_of, plan_sailing } from "./plan";

self.onmessage = ({ data }: MessageEvent<Round>) => {
  const deck = deck_for(data);
  const found = plan_sailing(deck, (i) => spawn_pose(deck, deck.queue[i]));
  const par: Par | null = found ? par_of(found, deck.queue.length) : null;
  self.postMessage(par);
};
