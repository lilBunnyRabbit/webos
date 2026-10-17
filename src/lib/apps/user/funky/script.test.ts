import { describe, expect, test } from "vitest";
import { apply_due, parse_script } from "./script";

describe("parse_script", () => {
  test("reads steps in time order, with or without the s", () => {
    const { steps, errors } = parse_script('3s Pitch = 1\n0.5 GearDown = on\n1s Brake = off\n2s SelectedWeapon = "Boom 50" // comment');
    expect(errors).toEqual([]);
    expect(steps).toEqual([
      { at: 0.5, name: "GearDown", value: 1 },
      { at: 1, name: "Brake", value: 0 },
      { at: 2, name: "SelectedWeapon", value: "Boom 50" },
      { at: 3, name: "Pitch", value: 1 },
    ]);
  });

  test("off is −1 for a boolean, 0 for a 0/1 number", () => {
    expect(parse_script("1s GearDown = off").steps[0].value).toBe(-1);
    expect(parse_script("1s Brake = off").steps[0].value).toBe(0);
  });

  test("reports bad lines by number", () => {
    const { errors } = parse_script("1s Pitch = 1\nnonsense\n2s Nope = 1\n3s Time = 4\n4s Pitch = up");
    expect(errors.map((error) => error.line)).toEqual([2, 3, 4, 5]);
  });
});

describe("apply_due", () => {
  test("applies each step once across ticks", () => {
    const { steps } = parse_script("0s Pitch = 1\n1s Pitch = 0");
    const world: Record<string, number | string> = {};
    expect(apply_due(steps, -1, 0, world)).toBe(true);
    expect(world.Pitch).toBe(1);
    expect(apply_due(steps, 0, 0.5, world)).toBe(false);
    expect(apply_due(steps, 0.5, 1, world)).toBe(true);
    expect(world.Pitch).toBe(0);
  });
});
