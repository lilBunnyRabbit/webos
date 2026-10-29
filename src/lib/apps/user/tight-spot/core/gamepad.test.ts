import { describe, expect, test } from "vitest";
import { BUTTON_KEYS, first_pad, PadButton, pressed, radial, read_pad, trigger, type PadLike } from "./gamepad";

function pad(axes: number[], values: Record<number, number> = {}, mapping = "standard"): PadLike {
  const buttons = Array.from({ length: 17 }, (_, index) => ({ pressed: (values[index] ?? 0) > 0.5, value: values[index] ?? 0 }));
  return { index: 0, mapping, connected: true, axes, buttons };
}

describe("radial deadzone", () => {
  test("rests inside, starts from 0 at its edge, full at the rim", () => {
    expect(radial(0.1, 0.1)).toBeNull();
    expect(radial(0.21, 0)!.x).toBeCloseTo(0.0125);
    expect(radial(1, 0)!.x).toBeCloseTo(1);
    expect(radial(-1, 0)!.x).toBeCloseTo(-1);
  });

  test("a diagonal keeps its direction", () => {
    const point = radial(0.6, 0.6)!;
    expect(point.x).toBeCloseTo(point.y);
  });
});

describe("read_pad", () => {
  test("stick across steers, a resting stick lets go", () => {
    expect(read_pad(pad([0.05, -0.1])).steer).toBeNull();
    expect(read_pad(pad([1, 0])).steer).toBeCloseTo(1);
    expect(read_pad(pad([-0.6, 0])).steer).toBeCloseTo(-0.5);
  });

  test("triggers are analog gas and brake with a small deadzone", () => {
    const state = read_pad(pad([0, 0], { [PadButton.RT]: 1, [PadButton.LT]: 0.03 }));
    expect(state.gas).toBe(1);
    expect(state.brake).toBe(0);
    expect(trigger(0.525)).toBeCloseTo(0.5);
  });

  test("a trigger counts as a press only past its threshold", () => {
    expect(read_pad(pad([0, 0], { [PadButton.RT]: 0.1 })).buttons[PadButton.RT]).toBe(false);
    expect(read_pad(pad([0, 0], { [PadButton.RT]: 0.3 })).buttons[PadButton.RT]).toBe(true);
  });
});

test("only a connected standard-mapping pad is used", () => {
  const odd = pad([0, 0], {}, "");
  const standard = { ...pad([0, 0]), index: 2 };
  expect(first_pad([null, odd, standard])).toBe(standard);
  expect(first_pad([{ ...standard, connected: false }])).toBeNull();
});

test("press edges fire once per press", () => {
  expect(pressed([false, true, false], [true, true, false])).toEqual([0]);
  expect(pressed([true], [true])).toEqual([]);
});

test("buttons send the keys the games handle", () => {
  expect(BUTTON_KEYS[PadButton.A]).toBe("KeyE");
  expect(BUTTON_KEYS[PadButton.B]).toBe("KeyR");
  expect(BUTTON_KEYS[PadButton.Y]).toBe("KeyN");
  expect(BUTTON_KEYS[PadButton.X]).toBe("KeyX");
  expect(BUTTON_KEYS[PadButton.MENU]).toBe("Space");
});
