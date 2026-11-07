import { SvelteSet } from "svelte/reactivity";
import { clamp_notch } from "$kit/games/play2d/lever";
import { COCKPITS, type Cockpit, type Detent } from "./cockpit";
import { elevator_for, air_of, wash_now, type Coefficients, type Env, type Input, type Plane } from "./plane";
import { expo, key_step } from "./stick";

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
  cockpit = $state.raw<Cockpit>(COCKPITS.trainer);
  notch = $state(0);
  trim = $state(0);
  flap_notch = $state(0);
  facing = $state(1);
  /** The stick from keys, −1 forward to 1 back. */
  key_stick = $state(0);
  /** A finger on the pitch pad or a mouse drag on the board: it wins over the keys while held. */
  held_stick = $state<number | null>(null);
  held_brake = $state(false);
  /** A finger held on a turn button: the ground crew walk an engineless plane that way. */
  held_walk = $state(0);
  brake = $state(0);
  readonly keys = new SvelteSet<string>();

  constructor(
    private readonly mode: () => PitchMode,
    cockpit: Cockpit
  ) {
    this.cockpit = cockpit;
    this.notch = cockpit.idle;
  }

  get detent(): Detent {
    return this.cockpit.detents[this.notch];
  }

  get flaps(): number {
    return this.cockpit.flaps[this.flap_notch];
  }

  get flap_name(): string {
    return this.cockpit.flap_names[this.flap_notch];
  }

  /** Which way the crew walk the plane: a held turn key or button. */
  get walk(): number {
    if (this.held_walk) return this.held_walk;
    const left = this.pressed(LEFT_KEYS);
    const right = this.pressed(RIGHT_KEYS);
    return left === right ? 0 : left ? -1 : 1;
  }

  get stick(): number {
    return expo(this.held_stick ?? this.key_stick);
  }

  fit(cockpit: Cockpit, facing = 1) {
    this.cockpit = cockpit;
    this.reset(facing);
  }

  step_notch(by: number) {
    this.notch = clamp_notch(this.notch + by, this.cockpit.detents.length);
  }

  set_notch(notch: number) {
    this.notch = clamp_notch(notch, this.cockpit.detents.length);
  }

  step_flaps(by: number) {
    this.flap_notch = clamp_notch(this.flap_notch + by, this.cockpit.flaps.length);
  }

  /** Trim so the plane holds the angle of attack it has now, hands off. */
  trim_now(plane: Plane, c: Coefficients, env?: Env) {
    this.trim = Math.max(-1, Math.min(1, elevator_for(air_of(plane, c, env).alpha, plane.flaps, c, wash_now(plane, c, env))));
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
    const detent = this.detent;
    return { throttle: detent.throttle, stick: this.stick, trim: this.trim, flaps: this.flaps, brake: this.brake, facing: this.facing, spoilers: detent.spoilers, reverse: detent.reverse };
  }

  release() {
    this.keys.clear();
    this.held_stick = null;
    this.held_brake = false;
    this.held_walk = 0;
    this.key_stick = 0;
    this.brake = 0;
  }

  reset(facing = 1) {
    this.release();
    this.notch = this.cockpit.idle;
    this.trim = 0;
    this.flap_notch = 0;
    this.facing = facing;
  }
}
