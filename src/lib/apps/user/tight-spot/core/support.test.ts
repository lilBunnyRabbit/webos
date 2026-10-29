import { describe, expect, test } from "vitest";
import { rect } from "./geometry";
import { support, tyres } from "./support";
import { create_car, Gear, VEHICLES } from "./vehicle";

describe("support", () => {
  const car = create_car({ x: 0, y: 0, heading: 0 });

  test("a tyre per wheel, the trailer's too", () => {
    expect(tyres(car, VEHICLES.hatch)).toHaveLength(4);
    expect(tyres(create_car({ x: 0, y: 0, heading: 0 }, Gear.PARK, VEHICLES.towing), VEHICLES.towing)).toHaveLength(6);
  });

  test("no ground is ground everywhere", () => {
    expect(support(car, VEHICLES.hatch, undefined)).toEqual([]);
  });

  test("names the tyres off the ground, across overlapping pieces", () => {
    const half = VEHICLES.hatch.track / 2;
    const behind = rect(-2, -half - 0.3, 1.5, -half + 0.3);
    const ahead = rect(1, -half - 0.3, 4, -half + 0.3);
    expect(support(car, VEHICLES.hatch, [behind, ahead])).toEqual([1, 3]);
    expect(support(car, VEHICLES.hatch, [behind, ahead], 0.35)).toEqual([0, 1, 2, 3]);
  });
});
