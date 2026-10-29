import { first_pad } from "./gamepad";

export const Rumble = { HIT: "hit", TICK: "tick" } as const;
export type Rumble = (typeof Rumble)[keyof typeof Rumble];

const EFFECTS: Record<Rumble, GamepadEffectParameters> = {
  [Rumble.HIT]: { duration: 220, strongMagnitude: 1, weakMagnitude: 0.6 },
  [Rumble.TICK]: { duration: 40, strongMagnitude: 0, weakMagnitude: 0.3 },
};

export function rumble(kind: Rumble) {
  if (!document.hasFocus()) return;
  const actuator = first_pad(navigator.getGamepads())?.vibrationActuator;
  actuator?.playEffect("dual-rumble", EFFECTS[kind]).catch(() => {});
}
