import { describe, expect, test } from "vitest";
import { hex_to_rgb } from "./remove-background";
import { find_crop_bounds } from "./trim";

function pixels(width: number, height: number, opaque: [number, number, number][]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of opaque) data[(y * width + x) * 4 + 3] = alpha;
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}

describe("remove background", () => {
  test("hex_to_rgb reads short and long hex", () => {
    expect(hex_to_rgb("#fff")).toEqual([255, 255, 255]);
    expect(hex_to_rgb("#00ff80")).toEqual([0, 255, 128]);
  });
});

describe("trim", () => {
  test("finds the box around visible pixels", () => {
    expect(
      find_crop_bounds(
        pixels(5, 4, [
          [1, 1, 255],
          [3, 2, 255],
        ]),
        0
      )
    ).toEqual({ top: 1, right: 4, bottom: 3, left: 1 });
  });

  test("pixels at or below the alpha threshold count as transparent", () => {
    expect(
      find_crop_bounds(
        pixels(4, 4, [
          [0, 0, 20],
          [2, 2, 255],
        ]),
        10
      )
    ).toEqual({ top: 2, right: 3, bottom: 3, left: 2 });
  });

  test("a fully transparent image keeps its bounds", () => {
    expect(find_crop_bounds(pixels(3, 2, []), 0)).toEqual({ top: 0, right: 3, bottom: 2, left: 0 });
  });
});
