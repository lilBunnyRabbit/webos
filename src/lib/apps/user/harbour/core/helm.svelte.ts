import { SvelteSet } from "svelte/reactivity";
import type { Input } from "./boat";
import { clamp_notch, DETENTS, HOLD_POWER, NEUTRAL, notch_at, ThrottleMode } from "./lever";

const WHEEL_RATE = 1.25;
export const AHEAD_KEYS = new Set(["KeyW", "ArrowUp"]);
export const ASTERN_KEYS = new Set(["KeyS", "ArrowDown"]);
export const PORT_KEYS = new Set(["KeyA", "ArrowLeft"]);
export const STARBOARD_KEYS = new Set(["KeyD", "ArrowRight"]);

/** The helm of one window: the lever's notch, the wheel that stays where it's left, and the keys held. */
export class Helm {
  notch = $state(NEUTRAL);
  wheel = $state(0);
  /** Touch in hold mode: the lever's position while a finger holds it. */
  held_lever = $state<number | null>(null);
  readonly keys = new SvelteSet<string>();

  constructor(private readonly mode: () => ThrottleMode) {}

  get lever(): number {
    if (this.mode() === ThrottleMode.HOLD) {
      if (this.held_lever !== null) return this.held_lever;
      const ahead = [...AHEAD_KEYS].some((k) => this.keys.has(k));
      const astern = [...ASTERN_KEYS].some((k) => this.keys.has(k));
      return ahead === astern ? 0 : ahead ? HOLD_POWER : -HOLD_POWER;
    }
    return DETENTS[this.notch];
  }

  /** The notch the HUD shows: in hold mode, whatever the keys or the finger give. */
  get shown(): number {
    return this.mode() === ThrottleMode.LEVER ? this.notch : notch_at(this.lever);
  }

  step_notch(by: number) {
    this.notch = clamp_notch(this.notch + by);
  }

  set_notch(notch: number) {
    this.notch = clamp_notch(notch);
  }

  neutral() {
    this.notch = NEUTRAL;
    this.held_lever = null;
  }

  set_wheel(value: number) {
    this.wheel = Math.max(-1, Math.min(1, value));
  }

  /** Called every physics step: held ← → turn the wheel at a hand's pace, and it stays when let go. */
  step(dt: number) {
    const port = [...PORT_KEYS].some((k) => this.keys.has(k));
    const starboard = [...STARBOARD_KEYS].some((k) => this.keys.has(k));
    if (port !== starboard) this.set_wheel(this.wheel + (starboard ? 1 : -1) * WHEEL_RATE * dt);
  }

  read(): Input {
    return { lever: this.lever, wheel: this.wheel };
  }

  release() {
    this.keys.clear();
    this.held_lever = null;
  }

  reset() {
    this.release();
    this.notch = NEUTRAL;
    this.wheel = 0;
  }
}
