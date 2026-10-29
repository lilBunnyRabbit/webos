import { describe, expect, test } from "vitest";
import { rect } from "../../core/geometry";
import { BED_COST, coverage, create_grid, Cut, Ground, mow, overlap, REPASS, stripe, trample, type Tally } from "./coverage";
import { deck_corners, DECKS, swept } from "./deck";
import { Vehicle } from "../../core/vehicle";

const garden = { width: 6, height: 3, lawn: [rect(0, 0, 6, 3)], beds: [rect(4.5, 0, 6, 1.5)], solids: [] };
const empty = (): Tally => ({ coverable: 0, mown: 0, overlapped: 0, trampled: 0 });

function covered(grid: ReturnType<typeof create_grid>) {
  grid.coverable.fill(0);
  for (let i = 0; i < grid.ground.length; i++) if (grid.ground[i] === Ground.LAWN) grid.coverable[i] = 1;
  return grid.coverable.reduce((sum, v) => sum + v, 0);
}

describe("coverage grid", () => {
  test("lays out lawn and beds by cell centre", () => {
    const grid = create_grid(garden);
    expect(grid.cols).toBe(40);
    expect(grid.rows).toBe(20);
    expect(grid.ground[0]).toBe(Ground.LAWN);
    expect(grid.ground[39]).toBe(Ground.BED);
  });

  test("stripes go by the axis the deck mostly travels", () => {
    expect(stripe({ x: 1, y: 0.2 })).toBe(Cut.LIGHT);
    expect(stripe({ x: -1, y: 0.2 })).toBe(Cut.DARK);
    expect(stripe({ x: 0.1, y: 1 })).toBe(Cut.LIGHT);
    expect(stripe({ x: 0.1, y: -1 })).toBe(Cut.DARK);
  });

  test("a pass mows once; the same cells cut again further on count as overlap, once each", () => {
    const grid = create_grid(garden);
    const tally = { ...empty(), coverable: covered(grid) };
    const shape = rect(0, 0, 1.5, 1.5);
    const first = mow(grid, shape, { x: 1, y: 0 }, 0, tally);
    expect(first.mown).toBe(100);
    expect(grid.dirty.length).toBe(100);
    expect(mow(grid, shape, { x: 1, y: 0 }, REPASS / 2, first)).toBe(first);
    const again = mow(grid, shape, { x: -1, y: 0 }, REPASS * 2, first);
    expect(again.overlapped).toBe(100);
    expect(grid.cut[0]).toBe(Cut.DARK);
    expect(mow(grid, shape, { x: 1, y: 0 }, REPASS * 4, again).overlapped).toBe(100);
    expect(overlap(again)).toBeCloseTo(100 / again.coverable);
  });

  test("flowers run over cost lawn, each cell once", () => {
    const grid = create_grid(garden);
    const tally = { ...empty(), coverable: covered(grid), mown: 400 };
    const once = trample(grid, [rect(4.5, 0, 6, 0.3)], tally);
    expect(once.trampled).toBe(20);
    expect(trample(grid, [rect(4.5, 0, 6, 0.3)], once)).toBe(once);
    expect(coverage(once)).toBeCloseTo((400 - 20 * BED_COST) / once.coverable);
  });

  test("the deck sweeps the hull of its two footprints", () => {
    const deck = DECKS[Vehicle.MOWER]!;
    const a = { x: 0, y: 0, heading: 0 };
    const b = { x: 0.5, y: 0, heading: 0 };
    const hull = swept(a, b, deck);
    expect(hull).toHaveLength(4);
    const xs = hull.map((p) => p.x);
    expect(Math.min(...xs)).toBeCloseTo(deck.rear);
    expect(Math.max(...xs)).toBeCloseTo(deck.front + 0.5);
    expect(deck_corners(a, deck)).toHaveLength(4);
  });
});
