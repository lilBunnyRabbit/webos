/** `now` for display, refreshed only while `active()`. Must be created during component init. */
export class Ticker {
  now = $state(Date.now());

  constructor(active: () => boolean, every: () => number = () => 250) {
    $effect(() => {
      if (!active()) return;
      this.now = Date.now();
      const timer = setInterval(() => (this.now = Date.now()), every());
      return () => clearInterval(timer);
    });
  }
}
