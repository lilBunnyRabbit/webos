import type { Rng } from "$lib/core/utils/random";
import {
  accept_mistake,
  backspace,
  create_run,
  enter,
  open_day,
  Phase,
  scan,
  scan_next,
  sorry,
  Stage,
  tick,
  type_key,
  type Run,
} from "./game";

export const KeypadKey = {
  BACK: "back",
  ENTER: "enter",
} as const;
export type KeypadKey = (typeof KeypadKey)[keyof typeof KeypadKey];

const LIT_MS = 140;

export class Shop {
  run = $state.raw<Run>(create_run());
  paused = $state(false);
  lit = $state<string | null>(null);
  private lit_timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly rng: Rng,
    private readonly on_end: (run: Run) => void
  ) {}

  get open(): boolean {
    return this.run.phase === Phase.OPEN;
  }

  get disputed(): boolean {
    return this.run.customer?.stage === Stage.DISPUTED;
  }

  advance(dt: number): void {
    const before = this.run;
    this.run = tick(before, dt, this.rng);
    if (before.phase === Phase.OPEN && this.run.phase !== Phase.OPEN) this.on_end(this.run);
  }

  open_shop(): void {
    this.paused = false;
    this.run = open_day(this.run);
  }

  new_run(): void {
    this.paused = false;
    this.run = open_day(create_run());
  }

  scan(index: number): void {
    if (!this.paused) this.run = scan(this.run, index);
  }

  scan_next(): void {
    if (!this.paused) this.run = scan_next(this.run);
  }

  press(key: string): void {
    if (!this.open || this.paused) return;
    this.light(key);
    if (key === KeypadKey.BACK) this.run = backspace(this.run);
    else if (key === KeypadKey.ENTER) this.run = this.disputed ? accept_mistake(this.run) : enter(this.run);
    else this.run = type_key(this.run, key);
  }

  sorry(): void {
    if (!this.paused) this.run = sorry(this.run);
  }

  toggle_pause(): void {
    if (this.open) this.paused = !this.paused;
  }

  destroy(): void {
    clearTimeout(this.lit_timer);
  }

  private light(key: string): void {
    this.lit = key;
    clearTimeout(this.lit_timer);
    this.lit_timer = setTimeout(() => (this.lit = null), LIT_MS);
  }
}
