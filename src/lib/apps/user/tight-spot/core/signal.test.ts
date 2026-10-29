import { describe, expect, it } from "vitest";
import { blink_lit, NO_SIGNAL, Signal, signal_after, toggle_signal } from "./signal";

function wheel_through(side: Signal, wheels: number[]): Signal {
  let state = toggle_signal(NO_SIGNAL, side);
  for (const wheel of wheels) state = signal_after(state, wheel);
  return state.side;
}

describe("turn signals", () => {
  it("cancels when the wheel unwinds past centre after a turn that way", () => {
    expect(wheel_through(Signal.LEFT, [0, -0.2, -0.6, -0.9, -0.4, -0.1, 0])).toBe(Signal.NONE);
    expect(wheel_through(Signal.RIGHT, [0.1, 0.5, 0.8, 0.2, 0.02])).toBe(Signal.NONE);
  });

  it("stays on through small corrections and a turn the other way", () => {
    expect(wheel_through(Signal.LEFT, [-0.1, 0.1, -0.2, 0])).toBe(Signal.LEFT);
    expect(wheel_through(Signal.RIGHT, [-0.6, -0.9, -0.3, 0])).toBe(Signal.RIGHT);
  });

  it("winds when switched on with the wheel already turned that way", () => {
    expect(wheel_through(Signal.LEFT, [-0.7, -0.5, 0])).toBe(Signal.NONE);
  });

  it("cancels on the same side again and switches on the other", () => {
    const left = toggle_signal(NO_SIGNAL, Signal.LEFT);
    expect(toggle_signal(left, Signal.LEFT)).toEqual(NO_SIGNAL);
    expect(toggle_signal(left, Signal.RIGHT)).toEqual({ side: Signal.RIGHT, wound: false });
  });

  it("blinks lit for the first half of each period", () => {
    expect(blink_lit(0.1)).toBe(true);
    expect(blink_lit(0.5)).toBe(false);
    expect(blink_lit(0.9)).toBe(true);
  });
});
