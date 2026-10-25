import { describe, expect, test } from "vitest";
import { autoscroll_step, before_of, clamp_offset, drop_index, shift_of, type Slot } from "./home-drag";

const slots: Slot[] = [
  { top: 0, height: 56 },
  { top: 58, height: 56 },
  { top: 116, height: 224 },
  { top: 342, height: 56 },
];

describe("drop_index", () => {
  test("stays put without moving", () => {
    expect(drop_index(slots, 1, 0)).toBe(1);
  });

  test("passes an item once its middle is crossed", () => {
    expect(drop_index(slots, 0, 30)).toBe(0);
    expect(drop_index(slots, 0, 60)).toBe(1);
    expect(drop_index(slots, 0, 210)).toBe(2);
  });

  test("a tall item held at the end reaches the last place", () => {
    expect(drop_index(slots, 2, clamp_offset(slots, 2, 999))).toBe(3);
  });

  test("moves up", () => {
    expect(drop_index(slots, 3, -150)).toBe(2);
    expect(drop_index(slots, 3, -400)).toBe(0);
  });
});

describe("shift_of", () => {
  test("items between the hole and the target step toward the hole", () => {
    expect([0, 1, 2, 3].map((index) => shift_of(index, 0, 2, 58))).toEqual([0, -58, -58, 0]);
    expect([0, 1, 2, 3].map((index) => shift_of(index, 3, 1, 58))).toEqual([0, 58, 58, 0]);
  });

  test("nothing moves when it's back home", () => {
    expect([0, 1, 2, 3].map((index) => shift_of(index, 2, 2, 226))).toEqual([0, 0, 0, 0]);
  });
});

test("clamp_offset keeps the dragged item inside the list", () => {
  expect(clamp_offset(slots, 1, -500)).toBe(-58);
  expect(clamp_offset(slots, 1, 500)).toBe(398 - 58 - 56);
  expect(clamp_offset(slots, 1, 20)).toBe(20);
});

test("autoscroll_step ramps near the edges only", () => {
  expect(autoscroll_step(400, 100, 700)).toBe(0);
  expect(autoscroll_step(100, 100, 700)).toBe(-14);
  expect(autoscroll_step(132, 100, 700)).toBe(-7);
  expect(autoscroll_step(700, 100, 700)).toBe(14);
  expect(autoscroll_step(900, 100, 700)).toBe(14);
});

test("before_of names the item that follows the landing spot", () => {
  const names = ["a", "b", "c", "d"];
  expect(before_of(names, 0, 2)).toBe("d");
  expect(before_of(names, 0, 3)).toBe(null);
  expect(before_of(names, 3, 0)).toBe("a");
});
