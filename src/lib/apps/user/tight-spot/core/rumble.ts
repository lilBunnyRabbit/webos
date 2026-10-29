export const Rumble = { HIT: "hit", TICK: "tick" } as const;
export type Rumble = (typeof Rumble)[keyof typeof Rumble];

const EFFECTS: Record<Rumble, GamepadEffectParameters> = {
  [Rumble.HIT]: { duration: 220, strongMagnitude: 1, weakMagnitude: 0.6 },
  [Rumble.TICK]: { duration: 40, strongMagnitude: 0, weakMagnitude: 0.3 },
};

// The games make their sounds without a handle on the window's settings, so the window in front with a controller and
// Rumble on names its pad here, and the sounds buzz it.
let target: number | null = null;

export function rumble_to(index: number | null) {
  target = index;
}

export function rumble(kind: Rumble) {
  if (target === null) return;
  const actuator = navigator.getGamepads()[target]?.vibrationActuator;
  actuator?.playEffect("dual-rumble", EFFECTS[kind]).catch(() => {});
}
