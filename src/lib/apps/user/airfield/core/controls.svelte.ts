import { SvelteSet } from "svelte/reactivity";
import { clamp_notch } from "$kit/games/play2d/lever";
import { elevator_for, air_of, wash_now, type Coefficients, type Input, type Plane } from "./plane";
import { expo, key_step } from "./stick";

export const THROTTLE = [0, 0.25, 0.5, 0.75, 1] as const;
export const THROTTLE_NAMES = ["Idle", "Quarter", "Half", "Cruise", "Full"] as const;
export const THROTTLE_LABELS = ["Idle", "¼", "½", "¾", "Full"] as const;
export const FLAPS = [0, 0.5, 1] as const;
export const FLAP_NAMES = ["Up", "Half", "Full"] as const;

export const PitchMode = { GAME: "game", PILOT: "pilot" } as const;
export type PitchMode = (typeof PitchMode)[keyof typeof PitchMode];

export const UP_KEYS = new Set(["KeyW", "ArrowUp"]);
export const DOWN_KEYS = new Set(["KeyS", "ArrowDown"]);
export const LEFT_KEYS = new Set(["KeyA", "ArrowLeft"]);
export const RIGHT_KEYS = new Set(["KeyD", "ArrowRight"]);
export const THROTTLE_UP_KEYS = new Set(["ShiftLeft", "ShiftRight", "KeyE"]);
export const THROTTLE_DOWN_KEYS = new Set(["ControlLeft", "ControlRight", "KeyQ"]);
export const BRAKE_KEYS = new Set(["KeyB"]);

const BRAKE_RATE = 1.2;

export class Controls {
  notch = $state(0);
  trim = $state(0);
  flap_notch = $state(0);
  facing = $state(1);
  /** The stick from keys, −1 forward to 1 back. */
  key_stick = $state(0);
  /** A finger on the pitch pad or a mouse drag on the board: it wins over the keys while held. */
  held_stick = $state<number | null>(null);
  held_brake = $state(false);
  brake = $state(0);
  readonly keys = new SvelteSet<string>();

  constructor(private readonly mode: () => PitchMode) {}

  get throttle(): number {
    return THROTTLE[this.notch];
  }

  get flaps(): number {
    return FLAPS[this.flap_notch];
  }

  get stick(): number {
    return expo(this.held_stick ?? this.key_stick);
  }

  step_notch(by: number) {
    this.notch = clamp_notch(this.notch + by, THROTTLE.length);
  }

  set_notch(notch: number) {
    this.notch = clamp_notch(notch, THROTTLE.length);
  }

  step_flaps(by: number) {
    this.flap_notch = clamp_notch(this.flap_notch + by, FLAPS.length);
  }

  /** Trim so the plane holds the angle of attack it has now, hands off. */
  trim_now(plane: Plane, c: Coefficients) {
    this.trim = Math.max(-1, Math.min(1, elevator_for(air_of(plane, c).alpha, plane.flaps, c, wash_now(plane, c))));
  }

  private pressed(set: Set<string>): boolean {
    for (const key of set) if (this.keys.has(key)) return true;
    return false;
  }

  step(dt: number) {
    const up = this.pressed(UP_KEYS);
    const down = this.pressed(DOWN_KEYS);
    const pull = this.mode() === PitchMode.GAME ? up : down;
    const push = this.mode() === PitchMode.GAME ? down : up;
    const goal = pull === push ? 0 : pull ? 1 : -1;
    this.key_stick = key_step(this.key_stick, goal, dt);
    const braking = this.held_brake || this.pressed(BRAKE_KEYS);
    this.brake = braking ? Math.min(1, this.brake + BRAKE_RATE * dt) : 0;
  }

  read(): Input {
    return { throttle: this.throttle, stick: this.stick, trim: this.trim, flaps: this.flaps, brake: this.brake, facing: this.facing };
  }

  release() {
    this.keys.clear();
    this.held_stick = null;
    this.held_brake = false;
    this.key_stick = 0;
    this.brake = 0;
  }

  reset(facing = 1) {
    this.release();
    this.notch = 0;
    this.trim = 0;
    this.flap_notch = 0;
    this.facing = facing;
  }
}
