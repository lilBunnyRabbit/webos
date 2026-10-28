import type { Rng } from "$lib/core/utils/random";
import {
  backspace,
  begin_day,
  create_run,
  enter,
  hire_staff,
  load_run,
  Phase,
  restock_key,
  tick,
  toggle_sale,
  type_key,
  warm_key,
  type Run,
  type SavedRun,
} from "./game";

export const KeypadKey = {
  BACK: "back",
  ENTER: "enter",
} as const;
export type KeypadKey = (typeof KeypadKey)[keyof typeof KeypadKey];

const LIT_MS = 140;

export interface ShopEvents {
  on_end: (run: Run) => void;
  on_close: (run: Run) => void;
  on_lost: (run: Run) => void;
}

export class Shop {
  run = $state.raw<Run>(create_run());
  lit = $state<string | null>(null);
  private lit_timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly rng: Rng,
    private readonly events: ShopEvents
  ) {}

  get phase(): Phase {
    return this.run.phase;
  }

  get animating(): boolean {
    return this.phase === Phase.OPEN || this.phase === Phase.WARMUP || this.phase === Phase.RESTOCK;
  }

  advance(dt: number): void {
    this.set(tick(this.run, dt, this.rng));
  }

  start(): void {
    this.set(begin_day(this.run, this.rng));
  }

  continue_run(saved: SavedRun): void {
    this.run = load_run(saved);
    this.start();
  }

  new_run(): void {
    this.run = create_run();
    this.start();
  }

  press(key: string): void {
    this.light(key);
    const run = this.run;
    if (run.phase === Phase.WARMUP) this.set(warm_key(run, key));
    else if (run.phase === Phase.RESTOCK) this.set(restock_key(run, key));
    else if (run.phase !== Phase.OPEN) return;
    else if (key === KeypadKey.BACK) this.set(backspace(run));
    else if (key === KeypadKey.ENTER) this.set(enter(run, this.rng));
    else this.set(type_key(run, key));
  }

  hire(): void {
    this.set(hire_staff(this.run));
  }

  toggle_sale(): void {
    this.set(toggle_sale(this.run));
    if (this.phase === Phase.DAY_OVER) this.events.on_close(this.run);
  }

  destroy(): void {
    clearTimeout(this.lit_timer);
  }

  private set(next: Run): void {
    const before = this.run;
    if (next === before) return;
    this.run = next;
    const done = next.phase === Phase.DAY_OVER || next.phase === Phase.GAME_OVER;
    if (done && before.phase !== next.phase) this.events.on_end(next);
    if (before.phase !== Phase.DAY_OVER && next.phase === Phase.DAY_OVER) this.events.on_close(next);
    if (before.phase !== Phase.GAME_OVER && next.phase === Phase.GAME_OVER) this.events.on_lost(next);
  }

  private light(key: string): void {
    this.lit = key;
    clearTimeout(this.lit_timer);
    this.lit_timer = setTimeout(() => (this.lit = null), LIT_MS);
  }
}
