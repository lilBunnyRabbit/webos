/**
 * Catches up the moment it's visible again. The interval is tracked: it changes when a counter starts or resets (one
 * under an hour needs seconds), and a minute-long timeout already waiting would otherwise hold the display that long.
 */
export class Clock {
  now = $state(Date.now());

  constructor(visible: () => boolean, interval: () => number) {
    $effect(() => {
      if (!visible()) return;
      const every = interval();
      let timer: ReturnType<typeof setTimeout>;
      const tick = () => {
        this.now = Date.now();
        timer = setTimeout(tick, every);
      };
      tick();
      return () => clearTimeout(timer);
    });
  }
}
