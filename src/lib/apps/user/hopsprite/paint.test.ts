import { describe, expect, it } from "vitest";
import type { Point } from "./model";
import { bounds_rect, dab, empty_bounds, pixel_perfect_step, restore, union_rect, type Ink, type Surface } from "./paint";
import { line_points, Pattern, pixel_perfect } from "./raster";

function surface(width: number, height: number, coverage = false): Surface {
  const base = new Uint8Array(width * height);
  return { base, data: base.slice(), width, height, selection: null, coverage: coverage ? new Uint16Array(width * height) : null };
}

const ink: Ink = { index: 3, pattern: Pattern.SOLID, offsets: [{ x: 0, y: 0 }], mirror_x: false, mirror_y: false };

describe("incremental painting", () => {
  it("matches the batch pixel-perfect filter point by point", () => {
    const raw: Point[] = [];
    const corners = [{ x: 0, y: 0 }, { x: 6, y: 3 }, { x: 2, y: 7 }, { x: 7, y: 7 }, { x: 1, y: 1 }];
    for (let i = 1; i < corners.length; i++) raw.push(...line_points(corners[i - 1], corners[i]).slice(i === 1 ? 0 : 1));

    const target = surface(8, 8, true);
    const trail: Point[] = [];
    for (const point of raw) {
      const bounds = empty_bounds();
      const { lift, add } = pixel_perfect_step(trail, point);
      if (lift) dab(target, ink, lift, -1, bounds);
      if (add) dab(target, ink, point, 1, bounds);
    }

    const expected = surface(8, 8);
    for (const point of pixel_perfect(raw)) dab(expected, ink, point, 1, empty_bounds());
    expect(Array.from(target.data)).toEqual(Array.from(expected.data));
  });

  it("keeps a pixel when a lifted dab crosses an earlier one", () => {
    const target = surface(3, 3, true);
    dab(target, ink, { x: 1, y: 1 }, 1, empty_bounds());
    dab(target, ink, { x: 1, y: 1 }, 1, empty_bounds());
    dab(target, ink, { x: 1, y: 1 }, -1, empty_bounds());
    expect(target.data[4]).toBe(3);
  });

  it("reports the changed bounds, mirrors included", () => {
    const target = surface(8, 4);
    const bounds = empty_bounds();
    dab(target, { ...ink, mirror_x: true }, { x: 1, y: 2 }, 1, bounds);
    expect(bounds_rect(bounds)).toEqual({ x: 1, y: 2, width: 6, height: 1 });
  });

  it("restores a rect from the base", () => {
    const target = surface(4, 4);
    target.data.fill(5);
    restore(target, { x: 1, y: 1, width: 2, height: 2 });
    expect(target.data[5]).toBe(0);
    expect(target.data[0]).toBe(5);
    expect(union_rect({ x: 0, y: 0, width: 1, height: 1 }, { x: 2, y: 3, width: 1, height: 1 })).toEqual({ x: 0, y: 0, width: 3, height: 4 });
  });
});
