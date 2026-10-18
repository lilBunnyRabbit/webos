import { describe, expect, test } from "vitest";
import { Direction, key_direction, swipe_direction } from "./direction";

describe("direction", () => {
  test("key_direction maps arrows and WASD by code", () => {
    expect(key_direction("ArrowUp")).toBe(Direction.UP);
    expect(key_direction("ArrowRight")).toBe(Direction.RIGHT);
    expect(key_direction("KeyA")).toBe(Direction.LEFT);
    expect(key_direction("KeyS")).toBe(Direction.DOWN);
    expect(key_direction("KeyQ")).toBeNull();
  });

  test("swipe_direction picks the dominant axis past the threshold", () => {
    expect(swipe_direction(5, 3, 20)).toBeNull();
    expect(swipe_direction(10, 10, 24)).toBeNull();
    expect(swipe_direction(30, 10, 20)).toBe(Direction.RIGHT);
    expect(swipe_direction(-30, 10, 20)).toBe(Direction.LEFT);
    expect(swipe_direction(10, -30, 20)).toBe(Direction.UP);
    expect(swipe_direction(10, 30, 20)).toBe(Direction.DOWN);
  });
});
