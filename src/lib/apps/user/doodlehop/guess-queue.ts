export interface GuessQueueOptions<T> {
  idle_ms: number;
  /** Takes the snapshot at call time, so strokes made while an answer was out go into the next one. */
  ask: (signal: AbortSignal) => Promise<T>;
  onanswer: (answer: T) => void;
  onerror: (reason: unknown) => void;
}

export class GuessQueue<T> {
  private readonly options: GuessQueueOptions<T>;
  private version = 0;
  private asked = 0;
  private pen_down = false;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flight: { controller: AbortController; done: Promise<void> } | null = null;

  constructor(options: GuessQueueOptions<T>) {
    this.options = options;
  }

  get busy(): boolean {
    return this.flight !== null;
  }

  pen(down: boolean): void {
    this.pen_down = down;
    if (down) this.clear_timer();
  }

  changed(): void {
    this.version++;
    this.schedule();
  }

  /** Ink went away (undo, clear): the answer out is about a drawing that no longer exists. */
  replaced(): void {
    this.flight?.controller.abort();
    this.version++;
    this.schedule();
  }

  // The answer already out still counts: it was asked before the clock ran out.
  close(): Promise<void> {
    this.closed = true;
    this.clear_timer();
    return this.flight?.done ?? Promise.resolve();
  }

  cancel(): void {
    this.closed = true;
    this.clear_timer();
    this.flight?.controller.abort();
  }

  private schedule(): void {
    this.clear_timer();
    if (this.closed || this.pen_down) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.send();
    }, this.options.idle_ms);
  }

  private clear_timer(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private send(): void {
    if (this.closed || this.flight || this.asked === this.version) return;
    this.asked = this.version;
    const controller = new AbortController();
    const done = this.options
      .ask(controller.signal)
      .then(
        (answer) => {
          if (!controller.signal.aborted) this.options.onanswer(answer);
        },
        (reason) => {
          if (!controller.signal.aborted) this.options.onerror(reason);
        }
      )
      .finally(() => {
        this.flight = null;
        if (!this.pen_down && this.timer === null) this.send();
      });
    this.flight = { controller, done };
  }
}
