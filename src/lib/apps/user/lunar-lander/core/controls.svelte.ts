import { SvelteSet } from "svelte/reactivity";
import { clamp_notch } from "$kit/games/play2d/lever";
import type { Input } from "./lander";
import { detents, HOVER_NOTCH, type Detent } from "./lever";

export const LEVER_UP_KEYS = new Set(["KeyW", "ArrowUp", "ShiftLeft", "ShiftRight"]);
export const LEVER_DOWN_KEYS = new Set(["KeyS", "ArrowDown", "ControlLeft", "ControlRight"]);
export const LEFT_KEYS = new Set(["KeyA", "ArrowLeft"]);
export const RIGHT_KEYS = new Set(["KeyD", "ArrowRight"]);
export const BURN_KEYS = new Set(["Space"]);

export class Controls {
  notch = $state(0);
  /** The throttle that hovers the ship now; the lever's notches sit around it. */
  hover = $state(0.4);
  /** A finger on a turn button: −1 left, 1 right. */
  held_turn = $state(0);
  held_burn = $state(false);
  readonly keys = new SvelteSet<string>();

  readonly detents = $derived<Detent[]>(detents(this.hover));

  get detent(): Detent {
    return this.detents[this.notch];
  }

  get burning(): boolean {
    return this.held_burn || this.pressed(BURN_KEYS);
  }

  /** −1 to 1, positive to the left (anticlockwise), as `Input.turn`. */
  get turn(): number {
    if (this.held_turn) return -this.held_turn;
    const left = this.pressed(LEFT_KEYS);
    const right = this.pressed(RIGHT_KEYS);
    return left === right ? 0 : left ? 1 : -1;
  }

  private pressed(set: Set<string>): boolean {
    for (const key of set) if (this.keys.has(key)) return true;
    return false;
  }

  step_notch(by: number) {
    this.notch = clamp_notch(this.notch + by, this.detents.length);
  }

  set_notch(notch: number) {
    this.notch = clamp_notch(notch, this.detents.length);
  }

  read(): Input {
    return { throttle: this.burning ? 1 : this.detent.throttle, turn: this.turn };
  }

  release() {
    this.keys.clear();
    this.held_turn = 0;
    this.held_burn = false;
  }

  reset(notch: number = HOVER_NOTCH) {
    this.release();
    this.notch = notch;
  }
}
