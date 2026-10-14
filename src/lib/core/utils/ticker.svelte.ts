// The interval is tracked so a change restarts the timer at once; a minute-long timeout already waiting would otherwise hold the display that long.
export class Ticker {
  now = $state(Date.now());

  constructor(visible: () => boolean, interval: number | (() => number)) {
    $effect(() => {
      if (!visible()) return;
      const every = typeof interval === "number" ? interval : interval();
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
