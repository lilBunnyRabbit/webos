import { WheelMode } from "./settings.svelte";
import { BACK_KEYS, FORWARD_KEYS } from "./keys";
import { Gear, steer_boost, type Input, type VehicleSpec } from "./vehicle";

export type Hold = "gas" | "brake" | "left" | "right";

const RELEASED: Record<Hold, boolean> = { gas: false, brake: false, left: false, right: false };

export class DriveInput {
  wheel = $state(0);
  held = $state({ ...RELEASED });

  // Read every physics step, never rendered, so holding a key doesn't re-run effects.
  readonly keys = new Set<string>();
  private readonly holds: Record<Hold, Set<number>> = { gas: new Set(), brake: new Set(), left: new Set(), right: new Set() };
  private hands = false;
  private steering_by_keys = false;
  private steer_way = 0;
  private steer_held = 0;

  step_wheel(dt: number, spec: VehicleSpec, mode: WheelMode) {
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD") || this.holds.right.size > 0;
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA") || this.holds.left.size > 0;
    const turn = (right ? 1 : 0) - (left ? 1 : 0);
    if (turn !== 0) {
      this.hands = true;
      this.steering_by_keys = true;
      // Held while the wheel still points the other way, it winds back faster; letting go or flipping starts over.
      this.steer_held = turn === this.steer_way ? this.steer_held + dt : dt;
      this.steer_way = turn;
      const rate = (dt / spec.steer_time) * steer_boost(this.steer_held, this.wheel * turn < 0);
      this.wheel = Math.max(-1, Math.min(1, this.wheel + Math.sign(turn - this.wheel) * Math.min(rate, Math.abs(turn - this.wheel))));
    } else {
      this.steer_way = 0;
      this.steer_held = 0;
      if (this.steering_by_keys && mode === WheelMode.CENTRES) {
        this.hands = false;
        this.steering_by_keys = false;
      }
    }
  }

  read(gear: Gear): Input {
    // The arrows and the pedals mean a direction (Gas forward, Brake back): toward the gear's way is gas, against it the brake.
    const forward = FORWARD_KEYS.some((code) => this.keys.has(code)) || this.holds.gas.size > 0;
    const back = BACK_KEYS.some((code) => this.keys.has(code)) || this.holds.brake.size > 0;
    const reversing = gear === Gear.REVERSE;
    const gas = reversing ? back : forward;
    const brake = reversing ? forward : back;
    return { steer: this.hands ? this.wheel : null, throttle: gas ? 1 : 0, brake: brake ? 1 : 0 };
  }

  follow(share: number) {
    if (!this.hands) this.wheel = share;
  }

  set_wheel(value: number) {
    this.hands = true;
    this.steering_by_keys = false;
    this.wheel = value;
  }

  press(which: Hold, pointer: number): boolean {
    const fresh = this.holds[which].size === 0;
    this.holds[which].add(pointer);
    this.held[which] = true;
    return fresh;
  }

  lift(which: Hold, pointer: number) {
    this.holds[which].delete(pointer);
    this.held[which] = this.holds[which].size > 0;
  }

  // The held buttons unmount when the steering switches to the wheel, so their lostpointercapture never arrives.
  drop_steer_buttons() {
    this.holds.left.clear();
    this.holds.right.clear();
    this.held = { ...this.held, left: false, right: false };
  }

  busy(): boolean {
    return this.keys.size > 0 || Object.values(this.holds).some((pointers) => pointers.size > 0);
  }

  release() {
    this.keys.clear();
    for (const pointers of Object.values(this.holds)) pointers.clear();
    this.held = { ...RELEASED };
  }

  reset() {
    this.release();
    this.hands = false;
    this.steering_by_keys = false;
    this.wheel = 0;
  }
}
