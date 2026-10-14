import { describe, expect, it } from "vitest";
import { Handle, aspect_of, drag_rect, fit_aspect } from "./crop-rect";

const bounds = { width: 200, height: 100 };
const start = { x: 50, y: 25, width: 100, height: 50 };

describe("fit_aspect", () => {
  it("centres the largest rect of the ratio", () => {
    expect(fit_aspect(bounds, 1)).toEqual({ x: 50, y: 0, width: 100, height: 100 });
    expect(fit_aspect(bounds, null)).toEqual({ x: 0, y: 0, width: 200, height: 100 });
  });
});

describe("drag_rect, free", () => {
  it("moves inside the image", () => {
    expect(drag_rect(start, Handle.MOVE, 500, -500, bounds, null)).toEqual({ x: 100, y: 0, width: 100, height: 50 });
  });

  it("moves one edge and stops at the image", () => {
    expect(drag_rect(start, Handle.E, 1000, 0, bounds, null)).toEqual({ x: 50, y: 25, width: 150, height: 50 });
    expect(drag_rect(start, Handle.NW, -10, -10, bounds, null)).toEqual({ x: 40, y: 15, width: 110, height: 60 });
  });

  it("never flips past the opposite edge", () => {
    expect(drag_rect(start, Handle.W, 500, 0, bounds, null).width).toBe(1);
  });
});

describe("drag_rect, locked", () => {
  it("keeps the ratio on a corner from the opposite corner", () => {
    expect(drag_rect(start, Handle.SE, 20, 0, bounds, 2)).toEqual({ x: 50, y: 25, width: 120, height: 60 });
  });

  it("shrinks to fit the image", () => {
    expect(drag_rect(start, Handle.SE, 500, 500, bounds, 2)).toEqual({ x: 50, y: 25, width: 150, height: 75 });
  });

  it("grows an edge around the opposite edge's centre", () => {
    expect(drag_rect(start, Handle.S, 0, 10, bounds, 2)).toEqual({ x: 40, y: 25, width: 120, height: 60 });
  });
});

describe("aspect_of", () => {
  it("resolves presets", () => {
    expect(aspect_of("free", bounds)).toBeNull();
    expect(aspect_of("original", bounds)).toBe(2);
    expect(aspect_of("16:9", bounds)).toBeCloseTo(16 / 9);
  });
});
