import { describe, expect, it } from "vitest";
import { grip_share, with_grip } from "./grip";
import { F1_CAR, NO_INPUT, VEHICLES } from "./vehicle";

describe("grip", () => {
  it("holds the wheel to what the tyres can take at speed", () => {
    expect(grip_share(0, F1_CAR)).toBe(1);
    expect(grip_share(3, F1_CAR)).toBe(1);
    expect(grip_share(13, F1_CAR)).toBeLessThan(0.35);
    expect(with_grip({ steer: -1, throttle: 1, brake: 0 }, 13, F1_CAR).steer).toBeCloseTo(-grip_share(13, F1_CAR));
    expect(with_grip(NO_INPUT, 13, F1_CAR)).toBe(NO_INPUT);
  });

  it("leaves a road vehicle's parking speeds alone", () => {
    for (const spec of [VEHICLES.hatch, VEHICLES.van, VEHICLES.bus, VEHICLES.coach, VEHICLES.artic, VEHICLES.towing]) {
      expect(grip_share(3, spec)).toBe(1);
      const input = { steer: 1, throttle: 1, brake: 0 };
      expect(with_grip(input, -3, spec)).toBe(input);
    }
  });
});
