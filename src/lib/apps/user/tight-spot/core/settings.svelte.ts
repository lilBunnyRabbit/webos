import type { StorageHandle } from "$lib/core/contexts/app";
import { z } from "zod";

export const WheelMode = { CENTRES: "centres", STAYS: "stays" } as const;
export type WheelMode = (typeof WheelMode)[keyof typeof WheelMode];
export const wheel_schema = z.enum([WheelMode.CENTRES, WheelMode.STAYS]);

export const SteeringMode = { WHEEL: "wheel", BUTTONS: "buttons" } as const;
export type SteeringMode = (typeof SteeringMode)[keyof typeof SteeringMode];
export const steering_schema = z.enum([SteeringMode.WHEEL, SteeringMode.BUTTONS]);

export type Toggle = "sound" | "rumble" | "guides" | "creep";

// Per window, like every other choice in the app: two windows don't change each other's settings until reopened.
export class DriveSettings {
  sound = $state(true);
  rumble = $state(true);
  guides = $state(true);
  creep = $state(false);
  wheel = $state<WheelMode>(WheelMode.CENTRES);
  steering = $state<SteeringMode>(SteeringMode.WHEEL);

  constructor(private readonly storage: StorageHandle) {
    this.sound = storage.get("sound", z.boolean()) ?? true;
    this.rumble = storage.get("rumble", z.boolean()) ?? true;
    this.guides = storage.get("guides", z.boolean()) ?? true;
    this.creep = storage.get("creep", z.boolean()) ?? false;
    this.wheel = storage.get("wheel", wheel_schema) ?? WheelMode.CENTRES;
    this.steering = storage.get("steering", steering_schema) ?? SteeringMode.WHEEL;
  }

  toggle(name: Toggle, value: boolean) {
    this[name] = value;
    this.storage.set(name, value);
  }

  set_wheel(value: WheelMode) {
    this.wheel = value;
    this.storage.set("wheel", value);
  }

  set_steering(value: SteeringMode) {
    this.steering = value;
    this.storage.set("steering", value);
  }
}
