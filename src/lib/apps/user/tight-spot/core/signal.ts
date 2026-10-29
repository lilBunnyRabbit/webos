export const Signal = { NONE: "none", LEFT: "left", RIGHT: "right" } as const;
export type Signal = (typeof Signal)[keyof typeof Signal];

export const SIGNAL_KEYS: Record<string, Signal> = { KeyZ: Signal.LEFT, KeyX: Signal.RIGHT };

export const BLINK_PERIOD = 0.8;
const WOUND = 0.3;
const UNWOUND = 0.05;

export interface SignalState {
  side: Signal;
  wound: boolean;
}

export const NO_SIGNAL: SignalState = { side: Signal.NONE, wound: false };

export function toggle_signal(state: SignalState, side: Signal): SignalState {
  if (side === Signal.NONE || state.side === side) return NO_SIGNAL;
  return { side, wound: false };
}

// Like a real stalk: only a wheel that turned toward the side and then came back past centre throws it off.
export function signal_after(state: SignalState, wheel: number): SignalState {
  if (state.side === Signal.NONE) return state;
  const toward = state.side === Signal.LEFT ? -wheel : wheel;
  if (!state.wound) return toward > WOUND ? { ...state, wound: true } : state;
  return toward < UNWOUND ? NO_SIGNAL : state;
}

export function blink_lit(time: number): boolean {
  return ((time % BLINK_PERIOD) + BLINK_PERIOD) % BLINK_PERIOD < BLINK_PERIOD / 2;
}
