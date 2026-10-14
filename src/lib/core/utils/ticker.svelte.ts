import { createSubscriber } from "svelte/reactivity";

/**
 * One clock per interval for the whole page, ticking on wall-clock boundaries (every second on the second), so every
 * live display with the same interval changes in the same frame: a Clock widget's second hand and a Time Since
 * counter move together. It runs only while something reads it.
 */
class SharedClock {
  private now = 0;
  private running = false;
  private subscribe: () => void;

  constructor(private readonly every: number) {
    this.subscribe = createSubscriber((update) => {
      let timer: ReturnType<typeof setTimeout>;
      const schedule = () => {
        timer = setTimeout(tick, this.every - (Date.now() % this.every));
      };
      const tick = () => {
        this.now = Date.now();
        update();
        schedule();
      };
      this.now = Date.now();
      this.running = true;
      schedule();
      return () => {
        this.running = false;
        clearTimeout(timer);
      };
    });
  }

  read(): number {
    this.subscribe();
    return this.running ? this.now : Date.now();
  }
}

const clocks = new Map<number, SharedClock>();

function clock(every: number): SharedClock {
  let shared = clocks.get(every);
  if (!shared) {
    shared = new SharedClock(every);
    clocks.set(every, shared);
  }
  return shared;
}

/**
 * A reactive `now` for live displays: reads the shared clock for `interval` while `visible()` is true and holds its
 * last value while not, catching up the moment it's visible again. A changed interval switches clocks at once. Read
 * `now` in markup, `$derived` or `$effect`.
 */
export class Ticker {
  private last = Date.now();

  constructor(
    private readonly visible: () => boolean,
    private readonly interval: number | (() => number)
  ) {}

  get now(): number {
    if (!this.visible()) return this.last;
    this.last = clock(typeof this.interval === "number" ? this.interval : this.interval()).read();
    return this.last;
  }
}
