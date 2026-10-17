import { describe, expect, test } from "vitest";
import { cap_label, heat, MAIN_BLOCK, NAV_BLOCK, NUMPAD_BLOCK, Shape } from "./keys";

const width = (row: { width: number }[]) => row.reduce((sum, cap) => sum + cap.width, 0);

test("every main row is 15 units, nav 3, numpad 4", () => {
  for (const shape of [Shape.ANSI, Shape.ISO]) for (const row of MAIN_BLOCK[shape]) expect(width(row)).toBe(15);
  for (const row of NAV_BLOCK) expect(width(row)).toBe(3);
  for (const row of NUMPAD_BLOCK) expect(width(row)).toBe(4);
});

describe("cap_label", () => {
  test("takes the layout map's printed character for writing keys", () => {
    expect(cap_label("KeyZ", new Map([["KeyZ", "y"]]), false)).toBe("Y");
    expect(cap_label("KeyZ", null, false)).toBe("Z");
    expect(cap_label("Digit4", null, false)).toBe("4");
  });

  test("names the rest, with Mac symbols on a Mac", () => {
    expect(cap_label("MetaLeft", null, true)).toBe("⌘");
    expect(cap_label("MetaLeft", null, false)).toBe("Win");
    expect(cap_label("Space", new Map([["Space", " "]]), false)).toBe("");
    expect(cap_label("F13", null, false)).toBe("F13");
  });
});

test("heat buckets", () => {
  expect([0, 1, 3, 9, 40].map(heat)).toEqual([0, 1, 2, 3, 4]);
});
