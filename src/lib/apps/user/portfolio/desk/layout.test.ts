import { describe, expect, test } from "vitest";
import { clamp_to, compose, fits_rail, HOW_MIN, MAX_DESK, overlaps, PAD, rail_width, TITLE_BAR, WHO_MIN, type Rect } from "./layout";
import { Win, WINDOWS } from "./script";

const inside = (rect: Rect, width: number, height: number) => rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height;
const TOUR: string[][] = [
  [Win.IDENTITY],
  [Win.IDENTITY, Win.TIMELINE],
  [Win.IDENTITY, Win.TIMELINE, Win.PROJECTS],
  [Win.IDENTITY, Win.TIMELINE, Win.PROJECTS, Win.HOW],
  WINDOWS,
];
const stage = (width: number, height: number): [number, number] => [width - rail_width(width), height];
// The app's own box at common screens, below a title bar: 1440×900, 1280×800, 1366×768, 1920×1080.
const DESKS = [stage(1440, 814), stage(1280, 714), stage(1366, 682), stage(1920, 994)];

describe("compose", () => {
  test("every slot fits the stage and the tiled windows never overlap", () => {
    for (const [width, height] of DESKS) {
      for (const open of TOUR) {
        const { slots } = compose(width, height, open);
        for (const rect of Object.values(slots)) expect(inside(rect, width, height)).toBe(true);
        const tiled = Object.entries(slots).filter(([id]) => id !== Win.CONTACT).map(([, rect]) => rect);
        for (const a of tiled) for (const b of tiled) if (a !== b) expect(overlaps(a, b)).toBe(false);
      }
    }
  });

  test("Who I am alone is the hero; once another window opens it takes the first column", () => {
    const [width, height] = DESKS[0];
    expect(compose(width, height, [Win.IDENTITY]).hero).toBe(true);
    const { slots, hero } = compose(width, height, [Win.IDENTITY, Win.TIMELINE]);
    expect(hero).toBe(false);
    expect(slots[Win.IDENTITY]).toMatchObject({ y: PAD, height: height - PAD * 2 });
  });

  test("Work and Side projects keep their slot through the tour and are full height", () => {
    for (const [width, height] of DESKS) {
      const [, , three, four, all] = TOUR.map((open) => compose(width, height, open).slots);
      for (const rest of [four, all]) {
        expect(rest[Win.TIMELINE]).toEqual(three[Win.TIMELINE]);
        expect(rest[Win.PROJECTS]).toEqual(three[Win.PROJECTS]);
      }
      expect(three[Win.TIMELINE].height).toBe(height - PAD * 2);
    }
  });

  test("How I build sits under Who I am in the first column", () => {
    for (const [width, height] of DESKS) {
      const { slots } = compose(width, height, WINDOWS);
      expect(slots[Win.HOW].x).toBe(slots[Win.IDENTITY].x);
      expect(slots[Win.HOW].width).toBe(slots[Win.IDENTITY].width);
      expect(slots[Win.HOW].y).toBeGreaterThan(slots[Win.IDENTITY].y + slots[Win.IDENTITY].height);
      expect(slots[Win.HOW].y + slots[Win.HOW].height).toBe(height - PAD);
    }
  });

  test("Contact gets no tile: it floats centred over the whole app instead", () => {
    for (const [width, height] of DESKS) expect(compose(width, height, WINDOWS).slots[Win.CONTACT]).toBeUndefined();
  });

  test("How I build is tall enough for every principle title, and Who I am keeps its minimum", () => {
    for (const [width, height] of DESKS) {
      const { slots } = compose(width, height, WINDOWS);
      expect(slots[Win.HOW].height).toBeGreaterThanOrEqual(HOW_MIN);
      expect(slots[Win.IDENTITY].height).toBeGreaterThanOrEqual(WHO_MIN);
    }
  });

  test("a wide screen centres the desk at its maximum width", () => {
    const { slots } = compose(2400, 994, WINDOWS);
    const start = slots[Win.IDENTITY].x;
    const end = slots[Win.PROJECTS].x + slots[Win.PROJECTS].width;
    expect(end - start).toBe(MAX_DESK);
    expect(Math.abs(start - (2400 - end))).toBeLessThanOrEqual(1);
  });
});

describe("fits_rail", () => {
  test("common desktops get the rail and three columns", () => {
    for (const [width, height] of [[1440, 814], [1280, 714], [1366, 682], [1920, 994], [2560, 1354]]) expect(fits_rail(width, height)).toBe(true);
  });

  test("short desktops, narrow windows and tablets stack instead of squeezing a column", () => {
    for (const [width, height] of [[1280, 554], [1440, 534], [1024, 514], [900, 614], [1024, 682], [768, 922]]) expect(fits_rail(width, height)).toBe(false);
  });
});

describe("clamp_to", () => {
  test("keeps a dragged window's title bar on the stage", () => {
    const rect = { x: -40, y: 900, width: 300, height: 200 };
    expect(clamp_to(rect, 800, 600)).toEqual({ ...rect, x: 0, y: 600 - TITLE_BAR });
    expect(clamp_to({ ...rect, x: 700, y: 10 }, 800, 600).x).toBe(500);
  });
});
