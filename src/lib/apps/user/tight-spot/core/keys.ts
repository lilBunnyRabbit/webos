import { Gear } from "./vehicle";

export const GEAR_KEYS: Record<string, Gear> = {
  KeyE: Gear.DRIVE,
  KeyR: Gear.REVERSE,
  KeyQ: Gear.REVERSE,
  KeyN: Gear.NEUTRAL,
  KeyP: Gear.PARK,
  Space: Gear.PARK,
};
export const FORWARD_KEYS = ["ArrowUp", "KeyW"];
export const BACK_KEYS = ["ArrowDown", "KeyS"];
// Below this the car counts as standing, so a fresh arrow press picks the direction instead of braking.
export const STANDING = 0.05;
export const DRIVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "KeyA", "KeyD", "KeyW", "KeyS"]);
export const GEARS: Gear[] = [Gear.PARK, Gear.REVERSE, Gear.NEUTRAL, Gear.DRIVE];
export const GEAR_NAMES: Record<Gear, string> = { P: "Park", R: "Reverse", N: "Neutral", D: "Drive" };

export function key_direction(code: string): Gear | null {
  return FORWARD_KEYS.includes(code) ? Gear.DRIVE : BACK_KEYS.includes(code) ? Gear.REVERSE : null;
}

export function zoom_step(code: string): number | null {
  if (code === "Equal" || code === "NumpadAdd") return 1.2;
  if (code === "Minus" || code === "NumpadSubtract") return 1 / 1.2;
  return null;
}

export function is_field(target: EventTarget | null): boolean {
  return target instanceof HTMLSelectElement || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
