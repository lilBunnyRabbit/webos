import { untrack } from "svelte";

/** Catches up the moment it's visible again; the interval is read per tick so it can't restart the loop. */
export class Clock {
  now = $state(Date.now());

  constructor(visible: () => boolean, interval: () => number) {
    $effect(() => {
      if (!visible()) return;
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        this.now = Date.now();
        timer = setTimeout(tick, untrack(interval));
      };
      tick();
      return () => clearTimeout(timer);
    });
  }
}
