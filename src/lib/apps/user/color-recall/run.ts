import type { Level } from "./modes";

export interface NextAction {
  label: string;
  run: () => void;
}

export interface RunProps<State> {
  seed: number;
  level: Level;
  /** Today's daily: one attempt, saved as it goes, recorded for Game Hub. */
  daily: boolean;
  head: string;
  link: string;
  saved: State | null;
  onsave: (state: State) => void;
  onfinish: (ms: number, score?: number) => void;
  next: NextAction;
}
