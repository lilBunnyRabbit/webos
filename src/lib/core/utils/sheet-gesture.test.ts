import { describe, expect, test } from "vitest";
import { RUBBER_LIMIT, claims_drag, release_velocity, rubber_band, sheet_offset, should_dismiss } from "./sheet-gesture";

describe("rubber_band", () => {
  test("gives less the further it goes and never reaches the limit", () => {
    expect(rubber_band(0)).toBe(0);
    expect(rubber_band(20)).toBeLessThan(20);
    expect(rubber_band(400)).toBeGreaterThan(rubber_band(200));
    expect(rubber_band(100_000)).toBeLessThan(RUBBER_LIMIT);
  });

  test("keeps the direction", () => {
    expect(rubber_band(-80)).toBeCloseTo(-rubber_band(80));
  });
});

describe("sheet_offset", () => {
  test("follows the finger down when dismissible", () => {
    expect(sheet_offset(120, true)).toBe(120);
  });

  test("resists upward always, and downward when it can't be dismissed", () => {
    expect(sheet_offset(-120, true)).toBe(rubber_band(-120));
    expect(sheet_offset(120, false)).toBe(rubber_band(120));
  });
});

describe("claims_drag", () => {
  test("takes a mostly downward move", () => {
    expect(claims_drag({ dx: 4, dy: 16, scrolled: false })).toBe(true);
  });

  test("leaves sideways and upward moves to the page", () => {
    expect(claims_drag({ dx: 20, dy: 10, scrolled: false })).toBe(false);
    expect(claims_drag({ dx: 0, dy: -16, scrolled: false })).toBe(false);
  });

  test("leaves the drag to a scroller that isn't at its top", () => {
    expect(claims_drag({ dx: 0, dy: 30, scrolled: true })).toBe(false);
  });
});

describe("release_velocity", () => {
  test("measures the last stretch of the drag", () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 10, t: 400 },
      { y: 30, t: 450 },
      { y: 60, t: 500 },
    ];
    expect(release_velocity(samples)).toBeCloseTo(50 / 100);
  });

  test("is zero without movement over time", () => {
    expect(release_velocity([])).toBe(0);
    expect(release_velocity([{ y: 10, t: 5 }])).toBe(0);
  });

  test("is negative moving up", () => {
    expect(
      release_velocity([
        { y: 100, t: 0 },
        { y: 40, t: 50 },
      ])
    ).toBeLessThan(0);
  });
});

describe("should_dismiss", () => {
  const base = { height: 400, velocity: 0, dismissible: true };

  test("closes past a quarter of the height", () => {
    expect(should_dismiss({ ...base, offset: 101 })).toBe(true);
    expect(should_dismiss({ ...base, offset: 99 })).toBe(false);
  });

  test("closes on a fast flick down however short", () => {
    expect(should_dismiss({ ...base, offset: 20, velocity: 0.8 })).toBe(true);
  });

  test("stays when flicked back up, even past the threshold", () => {
    expect(should_dismiss({ ...base, offset: 200, velocity: -0.8 })).toBe(false);
  });

  test("never closes a sheet that can't be dismissed", () => {
    expect(should_dismiss({ ...base, offset: 300, velocity: 2, dismissible: false })).toBe(false);
  });

  test("never closes from above its resting place", () => {
    expect(should_dismiss({ ...base, offset: -10, velocity: 1 })).toBe(false);
  });
});
