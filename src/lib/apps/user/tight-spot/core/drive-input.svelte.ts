import { WheelMode } from "./settings.svelte";
import { BACK_KEYS, FORWARD_KEYS } from "./keys";
import { NO_SIGNAL, Signal, signal_after, toggle_signal, type SignalState } from "./signal";
import { Gear, steer_boost, type Input, type VehicleSpec } from "./vehicle";

export type Hold = "gas" | "brake" | "left" | "right";

const RELEASED: Record<Hold, boolean> = { gas: false, brake: false, left: false, right: false };

export class DriveInput {
  wheel = $state(0);
  held = $state({ ...RELEASED });
  signal = $state<Signal>(Signal.NONE);

  // Read every physics step, never rendered, so holding a key doesn't re-run effects.
  readonly keys = new Set<string>();
  private readonly holds: Record<Hold, Set<number>> = { gas: new Set(), brake: new Set(), left: new Set(), right: new Set() };
  private hands = false;
  private steering_by_keys = false;
  private steer_way = 0;
  private steer_held = 0;
  private pad = { gas: 0, brake: 0 };
  private stalk: SignalState = NO_SIGNAL;

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
    this.watch_signal();
  }

  read(gear: Gear): Input {
    // The arrows and the pedals mean a direction (Gas forward, Brake back): toward the gear's way is gas, against it the brake.
    // A controller's triggers mean the same directions, analog: RT forward, LT back, the larger of pad and keys wins.
    const keyed_forward = FORWARD_KEYS.some((code) => this.keys.has(code)) || this.holds.gas.size > 0;
    const keyed_back = BACK_KEYS.some((code) => this.keys.has(code)) || this.holds.brake.size > 0;
    const forward = Math.max(keyed_forward ? 1 : 0, this.pad.gas);
    const back = Math.max(keyed_back ? 1 : 0, this.pad.brake);
    const reversing = gear === Gear.REVERSE;
    return { steer: this.hands ? this.wheel : null, throttle: reversing ? back : forward, brake: reversing ? forward : back, signal: this.signal };
  }

  follow(share: number) {
    if (!this.hands) this.wheel = share;
    this.watch_signal();
  }

  toggle_signal(side: Signal) {
    this.set_stalk(toggle_signal(this.stalk, side));
  }

  private watch_signal() {
    if (this.stalk.side !== Signal.NONE) this.set_stalk(signal_after(this.stalk, this.wheel));
  }

  private set_stalk(stalk: SignalState) {
    this.stalk = stalk;
    if (this.signal !== stalk.side) this.signal = stalk.side;
  }

  set_wheel(value: number) {
    this.hands = true;
    this.steering_by_keys = false;
    this.wheel = value;
  }

  set_pad(gas: number, brake: number) {
    this.pad = { gas, brake };
  }

  /** The stick came back to rest: hands off, so the wheel self-centres as the car rolls, like letting go of the arrows. */
  let_go() {
    this.hands = false;
    this.steering_by_keys = false;
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
    return this.keys.size > 0 || this.pad.gas > 0 || this.pad.brake > 0 || Object.values(this.holds).some((pointers) => pointers.size > 0);
  }

  release() {
    this.keys.clear();
    this.pad = { gas: 0, brake: 0 };
    for (const pointers of Object.values(this.holds)) pointers.clear();
    this.held = { ...RELEASED };
  }

  reset() {
    this.release();
    this.set_stalk(NO_SIGNAL);
    this.hands = false;
    this.steering_by_keys = false;
    this.wheel = 0;
  }
}
