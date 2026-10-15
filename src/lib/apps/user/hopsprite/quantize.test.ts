import { describe, expect, it } from "vitest";
import { index_pixels } from "./quantize";

describe("index_pixels", () => {
  it("reuses palette colours, adds new ones and keeps holes transparent", () => {
    const rgba = Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255, 9, 9, 9, 10, 255, 0, 0, 200]);
    const result = index_pixels(rgba, ["#00000000", "#ff0000ff"]);
    expect(Array.from(result.data)).toEqual([1, 2, 0, 1]);
    expect(result.palette).toEqual(["#00000000", "#ff0000ff", "#00ff00ff"]);
    expect(result.approximated).toBe(0);
  });

  it("maps to the nearest colour once the palette is full", () => {
    const full = ["#00000000", ...Array.from({ length: 255 }, (_, i) => `#${i.toString(16).padStart(2, "0")}0000ff`)];
    const result = index_pixels(Uint8ClampedArray.from([10, 1, 1, 255]), full);
    expect(result.palette).toHaveLength(256);
    expect(result.data[0]).toBe(11);
    expect(result.approximated).toBe(1);
  });
});
