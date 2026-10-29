import { CRAB_KEY } from "./keys";

export const PadButton = { A: 0, B: 1, X: 2, Y: 3, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9 } as const;
export type PadButton = (typeof PadButton)[keyof typeof PadButton];

export const BUTTON_KEYS: Partial<Record<number, string>> = {
  [PadButton.A]: "KeyE",
  [PadButton.B]: "KeyR",
  [PadButton.X]: CRAB_KEY,
  [PadButton.Y]: "KeyN",
  [PadButton.VIEW]: "KeyR",
  [PadButton.MENU]: "Space",
  [PadButton.RB]: "Enter",
};

export const STICK_DEADZONE = 0.2;
export const TRIGGER_DEADZONE = 0.05;
export const TRIGGER_PRESS = 0.15;

export interface PadLike {
  index: number;
  mapping: string;
  connected: boolean;
  axes: readonly number[];
  buttons: readonly { pressed: boolean; value: number }[];
}

export interface PadState {
  index: number;
  steer: number | null;
  gas: number;
  brake: number;
  buttons: boolean[];
}

export function first_pad<T extends PadLike>(pads: readonly (T | null)[]): T | null {
  return pads.find((pad): pad is T => !!pad && pad.connected && pad.mapping === "standard") ?? null;
}

// Radial, so a diagonal doesn't clip each axis on its own, and rescaled so steering starts from 0 at the deadzone's edge.
export function radial(x: number, y: number, deadzone = STICK_DEADZONE): { x: number; y: number } | null {
  const length = Math.hypot(x, y);
  if (length <= deadzone) return null;
  const scale = Math.min(1, (length - deadzone) / (1 - deadzone)) / length;
  return { x: x * scale, y: y * scale };
}

export function trigger(value: number): number {
  if (value <= TRIGGER_DEADZONE) return 0;
  return Math.min(1, (value - TRIGGER_DEADZONE) / (1 - TRIGGER_DEADZONE));
}

export function read_pad(pad: PadLike): PadState {
  const stick = radial(pad.axes[0] ?? 0, pad.axes[1] ?? 0);
  const value = (index: number) => pad.buttons[index]?.value ?? 0;
  const buttons = pad.buttons.map((button, index) =>
    index === PadButton.LT || index === PadButton.RT ? button.value > TRIGGER_PRESS : button.pressed
  );
  return { index: pad.index, steer: stick ? stick.x : null, gas: trigger(value(PadButton.RT)), brake: trigger(value(PadButton.LT)), buttons };
}

export function pressed(before: readonly boolean[], now: readonly boolean[]): number[] {
  const edges: number[] = [];
  now.forEach((down, index) => {
    if (down && !before[index]) edges.push(index);
  });
  return edges;
}
