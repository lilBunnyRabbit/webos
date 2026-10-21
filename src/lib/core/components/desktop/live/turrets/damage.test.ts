import { describe, expect, test } from "vitest";
import { contains, Edge } from "../geometry";
import { along, bite_outline, chip, depth_cap, FRESH_DEPTH, from_edge, inward, MAX_BITES, MAX_HIDDEN, prune, type Bite, type Damage } from "./damage";

const rect = { x: 100, y: 100, width: 400, height: 300 };
const bottom = (x: number) => ({ edge: Edge.BOTTOM, at: { x, y: 400 } });

function hits(times: number, at: number, pointer: { x: number; y: number } | null, start: Bite[] = []): Bite[] {
  let bites = start;
  for (let index = 0; index < times; index++) bites = chip(bites, bottom(at), rect, pointer, index);
  return bites;
}

describe("edge frame", () => {
  test("offsets run from the edge's start, depth inward", () => {
    expect(along(rect, Edge.BOTTOM, { x: 150, y: 400 })).toBe(50);
    expect(along(rect, Edge.RIGHT, { x: 500, y: 130 })).toBe(30);
    expect(inward(rect, Edge.BOTTOM, { x: 150, y: 380 })).toBe(20);
    expect(inward(rect, Edge.LEFT, { x: 110, y: 200 })).toBe(10);
    expect(from_edge(rect, Edge.BOTTOM, 50, 20)).toEqual({ x: 150, y: 380 });
    expect(from_edge(rect, Edge.RIGHT, 30, 5)).toEqual({ x: 495, y: 130 });
  });

  test("the cap is 18% of the short side, at most 60px", () => {
    expect(depth_cap(rect)).toBeCloseTo(54);
    expect(depth_cap({ x: 0, y: 0, width: 1000, height: 800 })).toBe(60);
  });
});

describe("chip", () => {
  test("a first hit opens a small bite where it landed", () => {
    expect(chip([], bottom(150), rect, null, 7)).toEqual([{ edge: Edge.BOTTOM, offset: 50, depth: FRESH_DEPTH, seed: 7 }]);
  });

  test("hits on the same spot dig toward the cursor, no deeper than it sits", () => {
    const bites = hits(40, 250, { x: 250, y: 380 });
    expect(bites).toHaveLength(1);
    expect(bites[0].depth).toBeCloseTo(20);
  });

  test("with the cursor deep inside, digging stops at the cap", () => {
    const bites = hits(100, 250, { x: 250, y: 150 });
    expect(bites).toHaveLength(1);
    expect(bites[0].depth).toBeCloseTo(depth_cap(rect));
  });

  test("a bite drifts toward the cursor along the edge", () => {
    const bites = hits(10, 250, { x: 280, y: 300 });
    expect(bites[0].offset).toBeGreaterThan(150);
    expect(bites[0].offset).toBeLessThanOrEqual(180);
  });

  test("a hit away from every bite opens a new one; a hit on another edge never merges", () => {
    let bites = chip([], bottom(150), rect, null, 1);
    bites = chip(bites, bottom(300), rect, null, 2);
    bites = chip(bites, { edge: Edge.LEFT, at: { x: 100, y: 398 } }, rect, null, 3);
    expect(bites.map((bite) => bite.edge)).toEqual([Edge.BOTTOM, Edge.BOTTOM, Edge.LEFT]);
  });

  test("a full target takes no new bites", () => {
    const full: Bite[] = Array.from({ length: MAX_BITES }, (_, index) => ({ edge: Edge.TOP, offset: index * 30, depth: 4, seed: index }));
    expect(chip(full, bottom(150), rect, null, 1)).toBe(full);
  });
});

describe("prune", () => {
  test("drops gone widgets, keeps hidden windows up to a limit, newest first", () => {
    const damage: Damage = new Map([
      ["Clock.widget", { window: false, bites: [] }],
      ["open", { window: true, bites: [] }],
    ]);
    for (let index = 0; index < MAX_HIDDEN + 2; index++) damage.set(`hidden-${index}`, { window: true, bites: [] });
    expect(prune(damage, new Set(["open"]))).toBe(true);
    expect(damage.has("Clock.widget")).toBe(false);
    expect(damage.has("open")).toBe(true);
    expect(damage.has("hidden-0")).toBe(false);
    expect(damage.has("hidden-1")).toBe(false);
    expect(damage.has(`hidden-${MAX_HIDDEN + 1}`)).toBe(true);
    expect(damage.size).toBe(MAX_HIDDEN + 1);
    expect(prune(damage, new Set(["open"]))).toBe(false);
  });
});

describe("bite_outline", () => {
  test("stays inside the bite's span and depth, and keeps its shape for a seed", () => {
    const bite: Bite = { edge: Edge.BOTTOM, offset: 200, depth: 30, seed: 42 };
    const outline = bite_outline(bite, rect);
    expect(outline).toEqual(bite_outline(bite, rect));
    const inner = outline.slice(1, -1);
    for (const point of inner) {
      expect(contains({ x: rect.x, y: rect.y + rect.height - 30 * 1.15, width: rect.width, height: 30 * 1.15 + 0.001 }, point)).toBe(true);
    }
    expect(outline[0].y).toBeGreaterThan(rect.y + rect.height);
    expect(Math.min(...inner.map((point) => point.y))).toBeLessThan(rect.y + rect.height - 10);
  });
});
