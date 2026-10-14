import { untrack } from "svelte";

/**
 * Game time that only counts while the player can see the game (ADR-035). Create it during component init, usually
 * as `new Stopwatch(() => win.is_visible)`.
 */
export class Stopwatch {
  private before = $state(0);
  private started_at = $state<number | null>(null);
  private now = $state(0);
  private active = $state(false);
  private visible: () => boolean;

  constructor(visible: () => boolean, elapsed = 0) {
    this.visible = visible;
    this.before = elapsed;
    $effect(() => {
      if (!this.active || !this.visible()) return;
      untrack(() => this.resume());
      const timer = setInterval(() => (this.now = Date.now()), 250);
      return () => {
        clearInterval(timer);
        untrack(() => this.fold());
      };
    });
  }

  get running(): boolean {
    return this.active;
  }

  /** Reactive, updated four times a second while counting. */
  get elapsed(): number {
    return this.before + (this.started_at === null ? 0 : this.now - this.started_at);
  }

  /** Exact, for saving or a final time. */
  read(): number {
    return this.before + (this.started_at === null ? 0 : Date.now() - this.started_at);
  }

  start(): void {
    this.active = true;
    if (this.visible()) this.resume();
  }

  /** Stops counting and returns the exact time. */
  pause(): number {
    this.fold();
    this.active = false;
    return this.before;
  }

  reset(elapsed = 0): void {
    this.active = false;
    this.started_at = null;
    this.before = elapsed;
  }

  private resume(): void {
    if (this.started_at === null) this.started_at = this.now = Date.now();
  }

  private fold(): void {
    if (this.started_at === null) return;
    this.before += Date.now() - this.started_at;
    this.started_at = null;
  }
}
