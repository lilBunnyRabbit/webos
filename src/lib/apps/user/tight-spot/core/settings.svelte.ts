import { z } from "zod";
import type { Prefs } from "./prefs";

export const WheelMode = { CENTRES: "centres", STAYS: "stays" } as const;
export type WheelMode = (typeof WheelMode)[keyof typeof WheelMode];
export const wheel_schema = z.enum([WheelMode.CENTRES, WheelMode.STAYS]);

export const SteeringMode = { WHEEL: "wheel", BUTTONS: "buttons" } as const;
export type SteeringMode = (typeof SteeringMode)[keyof typeof SteeringMode];
export const steering_schema = z.enum([SteeringMode.WHEEL, SteeringMode.BUTTONS]);

export type Toggle = "sound" | "rumble" | "guides" | "creep" | "speed_zoom" | "turn_view" | "hitboxes";

const saved_schema = z.object({
  sound: z.boolean().catch(true),
  rumble: z.boolean().catch(true),
  guides: z.boolean().catch(true),
  creep: z.boolean().catch(false),
  speed_zoom: z.boolean().catch(true),
  turn_view: z.boolean().catch(false),
  hitboxes: z.boolean().catch(false),
  wheel: wheel_schema.catch(WheelMode.CENTRES),
  steering: steering_schema.catch(SteeringMode.WHEEL),
});

// Per window, like every other choice in the app: two windows don't change each other's settings until reopened.
export class DriveSettings {
  sound = $state(true);
  rumble = $state(true);
  guides = $state(true);
  creep = $state(false);
  speed_zoom = $state(true);
  turn_view = $state(false);
  hitboxes = $state(false);
  wheel = $state<WheelMode>(WheelMode.CENTRES);
  steering = $state<SteeringMode>(SteeringMode.WHEEL);

  constructor(private readonly prefs: Prefs) {
    const saved = saved_schema.parse(prefs.value);
    this.sound = saved.sound;
    this.rumble = saved.rumble;
    this.guides = saved.guides;
    this.creep = saved.creep;
    this.speed_zoom = saved.speed_zoom;
    this.turn_view = saved.turn_view;
    this.hitboxes = saved.hitboxes;
    this.wheel = saved.wheel;
    this.steering = saved.steering;
  }

  toggle(name: Toggle, value: boolean) {
    this[name] = value;
    this.prefs.value[name] = value;
  }

  set_wheel(value: WheelMode) {
    this.wheel = value;
    this.prefs.value.wheel = value;
  }

  set_steering(value: SteeringMode) {
    this.steering = value;
    this.prefs.value.steering = value;
  }
}
