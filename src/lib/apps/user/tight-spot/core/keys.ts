import { can_crab, DriveKind, Gear, SteerAxle, type VehicleSpec } from "./vehicle";

export const CRAB_KEY = "KeyV";

export interface SteerHint {
  key_name: string;
  text: string;
}

export function steer_hints(spec: VehicleSpec): SteerHint[] {
  const drive = spec.drive;
  if (drive.kind === DriveKind.SKID) return [{ key_name: "← →", text: "turn" }];
  if (drive.kind === DriveKind.FRAME) return [{ key_name: "← →", text: "bend" }];
  if (can_crab(spec)) return [{ key_name: "← →", text: "steer" }, { key_name: "V", text: "crab" }];
  return [{ key_name: "← →", text: "steer" }];
}

export function drive_note(spec: VehicleSpec): string | null {
  const drive = spec.drive;
  if (drive.kind === DriveKind.SKID) return "Skid steer: the wheel slows one side; at full lock it spins on the spot as you give it gas.";
  if (drive.kind === DriveKind.FRAME) return "Frame steer: the wheel bends it in the middle, even standing still, and the back follows the front.";
  if (can_crab(spec)) return "Four-wheel steer. Crab mode turns every wheel the same way, so it slides sideways without turning; stop to switch.";
  if (drive.steer_axle === SteerAxle.ALL) return "All-wheel steer: the back wheels turn the other way, so it turns tight and the tail swings out.";
  if (drive.steer_axle === SteerAxle.REAR) return "Rear steer: the back swings out as you turn.";
  return null;
}

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
