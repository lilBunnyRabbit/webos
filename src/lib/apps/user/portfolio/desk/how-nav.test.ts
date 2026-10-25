import { describe, expect, it } from "vitest";
import { Axis, move_of, step_index, swipe_of } from "./how-nav";

describe("move_of", () => {
  it("reads both axes by default", () => {
    expect(move_of("ArrowRight")).toBe(1);
    expect(move_of("ArrowDown")).toBe(1);
    expect(move_of("ArrowLeft")).toBe(-1);
    expect(move_of("ArrowUp")).toBe(-1);
    expect(move_of("Enter")).toBe(0);
  });

  it("ignores the other axis", () => {
    expect(move_of("ArrowDown", Axis.X)).toBe(0);
    expect(move_of("ArrowRight", Axis.Y)).toBe(0);
    expect(move_of("ArrowUp", Axis.Y)).toBe(-1);
  });
});

describe("step_index", () => {
  it("wraps both ways", () => {
    expect(step_index(5, 1, 6)).toBe(0);
    expect(step_index(0, -1, 6)).toBe(5);
    expect(step_index(2, 1, 6)).toBe(3);
  });

  it("starts from nothing at either end", () => {
    expect(step_index(-1, 1, 6)).toBe(0);
    expect(step_index(-1, -1, 6)).toBe(5);
  });

  it("has nowhere to go in an empty list", () => {
    expect(step_index(0, 1, 0)).toBe(-1);
  });
});

describe("swipe_of", () => {
  it("turns forward on a drag left and back on a drag right", () => {
    expect(swipe_of(-60, 5)).toBe(1);
    expect(swipe_of(60, -5)).toBe(-1);
  });

  it("ignores short and mostly vertical drags", () => {
    expect(swipe_of(-20, 0)).toBe(0);
    expect(swipe_of(-60, 50)).toBe(0);
  });
});
