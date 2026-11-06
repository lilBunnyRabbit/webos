import { describe, expect, test } from "vitest";
import { against, dash_phase, darkest, lightest, signed_area, tread, wound } from "./draw-math";
import { rect } from "./geometry";

describe("contrast", () => {
  const ink = { colour: "ink", l: 0.15 };
  const glow = { colour: "glow", l: 0.95 };

  test("darkest and lightest pick by lightness", () => {
    const tones = [{ colour: "a", l: 0.4 }, ink, glow];
    expect(darkest(tones)).toBe(ink);
    expect(lightest(tones)).toBe(glow);
  });

  test("a body as light as the foreground gets the dark tone, a dark body the light one", () => {
    expect(against(0.745, ink, glow)).toBe(ink);
    expect(against(0.3, ink, glow)).toBe(glow);
    expect(against(0.55, ink, glow)).toBe(ink);
  });
});

describe("tread", () => {
  test("stripes cover the tyre at the pitch", () => {
    const stripes = tread(0, 0.1, 0.6);
    expect(stripes[0]).toBeLessThanOrEqual(-0.3);
    expect(stripes.at(-1)!).toBeGreaterThanOrEqual(0.3);
    for (let i = 1; i < stripes.length; i++) expect(stripes[i] - stripes[i - 1]).toBeCloseTo(0.1, 9);
  });

  test("rolling forward moves the stripes forward, reverse moves them back, a full pitch looks the same", () => {
    const at = tread(0, 0.1, 0.6);
    expect(tread(0.03, 0.1, 0.6)[0] - at[0]).toBeCloseTo(0.03, 9);
    expect(tread(-0.03, 0.1, 0.6)[0] - at[0]).toBeCloseTo(0.07, 9);
    expect(tread(0.1, 0.1, 0.6)).toEqual(at.map((x) => expect.closeTo(x, 9)));
    expect(tread(-12.37, 0.1, 0.6)[0]).toBeCloseTo(tread(0.03, 0.1, 0.6)[0], 6);
  });
});

describe("dash_phase", () => {
  test("two segments of one line share a pattern", () => {
    const period = 2.4;
    const a = dash_phase({ x: 16, y: 0 }, { x: 16, y: 10 }, period);
    const b = dash_phase({ x: 16, y: 33 }, { x: 16, y: 40 }, period);
    expect((a + 33) % period).toBeCloseTo(b, 9);
  });
});

describe("wound", () => {
  test("turns every piece the same way round", () => {
    const square = rect(0, 0, 2, 2);
    const reversed = [...square].reverse();
    expect(signed_area(square)).toBeGreaterThan(0);
    expect(signed_area(wound(reversed))).toBeGreaterThan(0);
    expect(wound(square)).toBe(square);
  });
});
