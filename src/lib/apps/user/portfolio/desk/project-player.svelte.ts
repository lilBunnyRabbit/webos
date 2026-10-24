export class GraphicPlayer {
  public t = $state(0);
  public plays = $state(0);
  public running = $state(false);

  private frame = 0;
  private last = 0;
  private visible = false;

  constructor(
    public duration: number,
    private readonly still: boolean
  ) {
    if (still) this.t = duration;
  }

  public get done(): boolean {
    return this.t >= this.duration;
  }

  public play(duration = this.duration): void {
    this.duration = duration;
    this.plays++;
    if (this.still) {
      this.t = duration;
      return;
    }
    this.t = 0;
    this.running = true;
    this.resume();
  }

  public set_visible(visible: boolean): void {
    this.visible = visible;
    if (visible) this.resume();
    else this.halt();
  }

  public destroy(): void {
    this.halt();
  }

  private resume(): void {
    if (!this.running || !this.visible || this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private halt(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private tick = (now: number): void => {
    this.frame = 0;
    // rAF timestamps can predate the performance.now() taken in resume(), and a hidden tab hands back one huge delta.
    this.t = Math.min(this.duration, this.t + Math.min(64, Math.max(0, now - this.last)));
    this.last = now;
    if (this.t >= this.duration) {
      this.running = false;
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };
}
