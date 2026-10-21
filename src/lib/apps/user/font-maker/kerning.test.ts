import { describe, expect, test } from "vitest";
import { place_glyph } from "./build";
import { auto_kerning, CLEARANCE, face_kerning, glyph_profile, kerning_candidate, MAX_KERN, MIN_KERN, pair_kern, type Profiled } from "./kerning";
import type { Glyph, Stroke } from "./model";

const BEARING = 60;
const TARGET = 2 * BEARING;

const line = (x0: number, y0: number, x1: number, y1: number): Stroke =>
  Array.from({ length: 11 }, (_, index) => [x0 + ((x1 - x0) * index) / 10, y0 + ((y1 - y0) * index) / 10, 0.5]);

const ring = (cx: number, cy: number, r: number): Stroke =>
  Array.from({ length: 41 }, (_, index) => {
    const angle = (index / 40) * 2 * Math.PI;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle), 0.5];
  });

const GLYPHS: Record<string, Stroke[]> = {
  A: [line(100, 0, 300, 700), line(300, 700, 500, 0), line(180, 300, 420, 300)],
  V: [line(100, 700, 300, 0), line(300, 0, 500, 700)],
  T: [line(100, 700, 500, 700), line(300, 700, 300, 0)],
  H: [line(100, 0, 100, 700), line(400, 0, 400, 700), line(100, 350, 400, 350)],
  o: [ring(300, 240, 220)],
  l: [line(100, 0, 100, 740)],
  ".": [line(100, 0, 100, 1)],
  "'": [line(100, 620, 100, 700)],
  "1": [line(300, 0, 300, 700)],
  "7": [line(100, 700, 400, 700), line(400, 700, 200, 0)],
  Á: [line(100, 0, 300, 700), line(300, 700, 500, 0)],
};

function placed(char: string): Profiled {
  return place_glyph({ strokes: GLYPHS[char] } as Glyph, BEARING)!;
}

const profile = (char: string) => glyph_profile(placed(char));
const kern = (pair: string) => pair_kern(profile(pair[0]), profile(pair[1]), TARGET);

function closest_gap(pair: string, value: number): number {
  const left = profile(pair[0]);
  const right = profile(pair[1]);
  let closest = Infinity;
  left.right.forEach((x, band) => {
    if (!Number.isNaN(x) && !Number.isNaN(right.left[band])) closest = Math.min(closest, left.advance - x + right.left[band] + value);
  });
  return closest;
}

describe("glyph_profile", () => {
  test("records the ink's left and right edge per band and nothing where there's no ink", () => {
    const glyph = placed("l");
    const result = glyph_profile(glyph);
    const xs = glyph.contours.flat().map((point) => point.x);
    const band = (y: number) => Math.floor((y + 1000) / 20);
    expect(result.left[band(300)]).toBeCloseTo(Math.min(...xs), 0);
    expect(result.right[band(300)]).toBeCloseTo(Math.max(...xs), 0);
    expect(Number.isNaN(result.left[band(900)])).toBe(true);
  });
});

describe("pair_kern", () => {
  test("straight stems side by side need nothing", () => {
    expect(Math.abs(kern("Hl"))).toBeLessThan(MIN_KERN);
    expect(Math.abs(kern("lH"))).toBeLessThan(MIN_KERN);
  });

  test("diagonals that lean together pull in, within the cap", () => {
    expect(kern("AV")).toBeLessThanOrEqual(-60);
    expect(kern("AV")).toBeGreaterThanOrEqual(-MAX_KERN);
    expect(kern("VA")).toBeLessThanOrEqual(-60);
    expect(kern("To")).toBeLessThan(-40);
  });

  test("round pairs tighten only a little and never closer than the clearance", () => {
    const round = kern("oo");
    expect(round).toBeLessThanOrEqual(0);
    expect(Math.abs(round)).toBeLessThan(0.25 * TARGET);
    expect(Math.abs(round)).toBeLessThan(Math.abs(kern("AV")) / 3);
    expect(closest_gap("oo", round)).toBeGreaterThanOrEqual(CLEARANCE * TARGET - 1);
    expect(closest_gap("AV", kern("AV"))).toBeGreaterThanOrEqual(CLEARANCE * TARGET - 1);
  });

  test("glyphs that share no band aren't kerned", () => {
    expect(kern("'.")).toBe(0);
  });
});

describe("auto_kerning", () => {
  const all = new Map(Object.keys(GLYPHS).map((char) => [char, placed(char)]));

  test("skips accented letters and digit pairs, keeps the rest at or above the minimum", () => {
    expect(kerning_candidate("Á")).toBe(false);
    expect(kerning_candidate("A")).toBe(true);
    expect(kerning_candidate("+")).toBe(false);
    const pairs = auto_kerning(all, TARGET);
    expect(pairs.has("AV")).toBe(true);
    expect([...pairs.keys()].some((pair) => pair.includes("Á"))).toBe(false);
    expect(pairs.has("71")).toBe(false);
    expect(pairs.has("17")).toBe(false);
    for (const value of pairs.values()) expect(Math.abs(value)).toBeGreaterThanOrEqual(MIN_KERN);
  });

  test("a limit keeps the strongest pairs", () => {
    const every = auto_kerning(all, TARGET);
    const two = auto_kerning(all, TARGET, 2);
    expect(two.size).toBe(2);
    const strongest = Math.min(...[...two.values()].map(Math.abs));
    for (const [pair, value] of every) if (!two.has(pair)) expect(Math.abs(value)).toBeLessThanOrEqual(strongest);
  });
});

describe("face_kerning", () => {
  const all = new Map(Object.keys(GLYPHS).map((char) => [char, placed(char)]));

  test("no kerning settings means no pairs", () => {
    expect(face_kerning(undefined, all, TARGET, 100).size).toBe(0);
  });

  test("manual adjustments add on top of auto, and stand alone with auto off", () => {
    const auto = auto_kerning(all, TARGET).get("AV")!;
    expect(face_kerning({ auto: true, pairs: { AV: -20 } }, all, TARGET, 100).get("AV")).toBe(auto - 20);
    expect(face_kerning({ auto: false, pairs: { AV: -20 } }, all, TARGET, 100)).toEqual(new Map([["AV", -20]]));
  });

  test("an adjustment that cancels auto drops the pair, and pairs for missing letters are skipped", () => {
    const auto = auto_kerning(all, TARGET).get("AV")!;
    expect(face_kerning({ auto: true, pairs: { AV: -auto } }, all, TARGET, 100).has("AV")).toBe(false);
    expect(face_kerning({ auto: false, pairs: { AZ: 30 } }, all, TARGET, 100).size).toBe(0);
  });
});
