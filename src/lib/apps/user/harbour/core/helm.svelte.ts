import { SvelteSet } from "svelte/reactivity";
import type { Input } from "./boat";
import { clamp_notch, DETENTS, HOLD_POWER, NEUTRAL, notch_at, ThrottleMode } from "./lever";

const WHEEL_RATE = 0.7;
export const AHEAD_KEYS = new Set(["KeyW", "ArrowUp"]);
export const ASTERN_KEYS = new Set(["KeyS", "ArrowDown"]);
export const PORT_KEYS = new Set(["KeyA", "ArrowLeft"]);
export const STARBOARD_KEYS = new Set(["KeyD", "ArrowRight"]);
const BOW_KEYS = { port: new Set(["KeyQ"]), starboard: new Set(["KeyE"]) };
const STERN_KEYS = { port: new Set(["KeyZ"]), starboard: new Set(["KeyX"]) };
export const THRUSTER_KEYS = new Set([...BOW_KEYS.port, ...BOW_KEYS.starboard, ...STERN_KEYS.port, ...STERN_KEYS.starboard]);

/** The helm of one window: the lever's notch, the wheel that stays where it's left, and the keys held. */
export class Helm {
  notch = $state(NEUTRAL);
  wheel = $state(0);
  /** Touch in hold mode: the lever's position while a finger holds it. */
  held_lever = $state<number | null>(null);
  /** Touch: the thruster buttons held, −1 port to 1 starboard. */
  held_bow = $state(0);
  held_stern = $state(0);
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

  get bow(): number {
    return this.held_bow || this.pair(BOW_KEYS);
  }

  get stern(): number {
    return this.held_stern || this.pair(STERN_KEYS);
  }

  private pair(keys: { port: Set<string>; starboard: Set<string> }): number {
    const port = [...keys.port].some((k) => this.keys.has(k));
    const starboard = [...keys.starboard].some((k) => this.keys.has(k));
    return port === starboard ? 0 : starboard ? 1 : -1;
  }

  read(): Input {
    return { lever: this.lever, wheel: this.wheel, bow: this.bow, stern: this.stern };
  }

  release() {
    this.keys.clear();
    this.held_lever = null;
    this.held_bow = 0;
    this.held_stern = 0;
  }

  reset() {
    this.release();
    this.notch = NEUTRAL;
    this.wheel = 0;
  }
}
