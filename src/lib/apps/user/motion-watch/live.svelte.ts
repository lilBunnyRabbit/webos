import type { MotionEvent } from "./events";

/** What the running job shares with Motion Watch's windows in its tab (`ctx.share`). */
export class LiveWatch {
  stream = $state.raw<MediaStream | null>(null);
  level = $state(0);
  motion = $state(false);
  lights = $state(false);
  recording = $state(false);
  last_motion = $state<number | null>(null);
  last_saved = $state.raw<MotionEvent | null>(null);
  saved = $state(0);
}

export function as_live(view: unknown): LiveWatch | null {
  return view instanceof LiveWatch ? view : null;
}
