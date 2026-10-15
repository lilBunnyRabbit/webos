import { describe, expect, test } from "vitest";
import type { Pixels } from "./flood-fill";
import { changed_bounds, clip_rect, copy_region, paste_region, segment_bounds, union } from "./patch";

function pixels(width: number, height: number, fill = 0): Pixels {
  return { data: new Uint8ClampedArray(width * height * 4).fill(fill), width, height };
}

function set(image: Pixels, x: number, y: number, value: number) {
  image.data.fill(value, (y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
}

describe("rects", () => {
  test("union grows to hold both", () => {
    expect(union(null, { x: 1, y: 1, width: 2, height: 2 })).toEqual({ x: 1, y: 1, width: 2, height: 2 });
    expect(union({ x: 0, y: 5, width: 2, height: 1 }, { x: 4, y: 1, width: 1, height: 1 })).toEqual({
      x: 0,
      y: 1,
      width: 5,
      height: 5,
    });
  });

  test("segment_bounds adds the margin on every side, in any direction", () => {
    expect(segment_bounds({ x: 10, y: 4 }, { x: 2, y: 8 }, 3)).toEqual({ x: -1, y: 1, width: 14, height: 10 });
  });

  test("clip_rect snaps outward to whole pixels and cuts to the canvas", () => {
    expect(clip_rect({ x: -1.5, y: 2.2, width: 4, height: 3.1 }, 10, 10)).toEqual({ x: 0, y: 2, width: 3, height: 4 });
    expect(clip_rect({ x: 8, y: 8, width: 5, height: 5 }, 10, 10)).toEqual({ x: 8, y: 8, width: 2, height: 2 });
    expect(clip_rect({ x: 20, y: 0, width: 5, height: 5 }, 10, 10)).toBeNull();
  });
});

describe("regions", () => {
  test("copy then paste round-trips a region", () => {
    const source = pixels(4, 3);
    set(source, 1, 1, 7);
    set(source, 2, 2, 9);
    const rect = { x: 1, y: 1, width: 2, height: 2 };
    const region = { data: copy_region(source, rect), width: 2, height: 2 };
    expect([...region.data.subarray(0, 4)]).toEqual([7, 7, 7, 7]);
    expect([...region.data.subarray(12, 16)]).toEqual([9, 9, 9, 9]);

    const target = pixels(4, 3);
    paste_region(target, region, 1, 1);
    expect(target.data).toEqual(source.data);
  });

  test("changed_bounds is the box of every differing pixel", () => {
    const a = pixels(5, 5);
    const b = pixels(5, 5);
    expect(changed_bounds(a, b)).toBeNull();
    set(b, 3, 1, 1);
    set(b, 1, 3, 1);
    expect(changed_bounds(a, b)).toEqual({ x: 1, y: 1, width: 3, height: 3 });
  });
});
