import { describe, expect, it } from "vitest";
import {
  DEFAULT_ADJUSTMENTS,
  OperationType,
  add_operation,
  filter_string,
  fit_zoom,
  format_of,
  name_for_format,
  normalize_degrees,
  result_size,
  resize_to,
  rotated_size,
  round_rect,
  step_zoom,
  type Operation,
} from "./edit";

const rotate = (degrees: number): Operation => ({ type: OperationType.ROTATE, degrees });
const flip = (horizontal: boolean): Operation => ({ type: OperationType.FLIP, horizontal });

describe("rotation", () => {
  it("normalizes into (-180, 180]", () => {
    expect(normalize_degrees(270)).toBe(-90);
    expect(normalize_degrees(-180)).toBe(180);
    expect(normalize_degrees(540)).toBe(180);
    expect(normalize_degrees(30)).toBe(30);
  });

  it("swaps sides on a quarter turn and keeps them on a half turn", () => {
    expect(rotated_size({ width: 40, height: 10 }, 90)).toEqual({ width: 10, height: 40 });
    expect(rotated_size({ width: 40, height: 10 }, -270)).toEqual({ width: 10, height: 40 });
    expect(rotated_size({ width: 40, height: 10 }, 180)).toEqual({ width: 40, height: 10 });
  });

  it("grows to the bounding box on a free angle", () => {
    expect(rotated_size({ width: 100, height: 100 }, 45)).toEqual({ width: 142, height: 142 });
  });
});

describe("operations", () => {
  it("tracks the size through the stack", () => {
    const operations: Operation[] = [
      { type: OperationType.CROP, x: 10, y: 0, width: 50, height: 20 },
      rotate(90),
      { type: OperationType.RESIZE, width: 10, height: 25 },
      flip(true),
    ];
    expect(result_size({ width: 100, height: 100 }, operations)).toEqual({ width: 10, height: 25 });
  });

  it("folds quarter turns and cancels a full one", () => {
    expect(add_operation([rotate(90)], rotate(90))).toEqual([rotate(180)]);
    expect(add_operation([rotate(90)], rotate(-90))).toEqual([]);
    expect(add_operation([rotate(15)], rotate(90))).toEqual([rotate(15), rotate(90)]);
  });

  it("cancels a repeated flip of the same axis only", () => {
    expect(add_operation([flip(true)], flip(true))).toEqual([]);
    expect(add_operation([flip(true)], flip(false))).toEqual([flip(true), flip(false)]);
  });

  it("drops a zero turn", () => {
    expect(add_operation([flip(true)], rotate(360))).toEqual([flip(true)]);
  });

  it("rounds a crop to whole pixels inside the image", () => {
    expect(round_rect({ x: -3, y: 4.4, width: 200, height: 0.2 }, { width: 100, height: 50 })).toEqual({ x: 0, y: 4, width: 100, height: 1 });
  });
});

describe("resize", () => {
  it("keeps the ratio from the side that changed", () => {
    expect(resize_to({ width: 400, height: 300 }, "width", 200, true)).toEqual({ width: 200, height: 150 });
    expect(resize_to({ width: 400, height: 300 }, "height", 600, true)).toEqual({ width: 800, height: 600 });
  });

  it("changes one side when the ratio is free and never goes below 1", () => {
    expect(resize_to({ width: 400, height: 300 }, "width", 0, false)).toEqual({ width: 1, height: 300 });
    expect(resize_to({ width: 1000, height: 10 }, "width", 10, true)).toEqual({ width: 10, height: 1 });
  });
});

describe("filter_string", () => {
  it("is none when nothing changed", () => {
    expect(filter_string(DEFAULT_ADJUSTMENTS)).toBe("none");
  });

  it("lists changed adjustments and scales the blur", () => {
    expect(filter_string({ ...DEFAULT_ADJUSTMENTS, brightness: 120, hue: -30, blur: 2 }, 0.5)).toBe("brightness(120%) hue-rotate(-30deg) blur(1px)");
  });
});

describe("formats", () => {
  it("reads writable formats from the extension", () => {
    expect(format_of("a.JPG")).toBe("image/jpeg");
    expect(format_of("a.webp")).toBe("image/webp");
    expect(format_of("a.gif")).toBeNull();
    expect(format_of("png")).toBeNull();
  });

  it("swaps the extension for another format", () => {
    expect(name_for_format("cat.png", "image/webp", ".webp")).toBe("cat.webp");
    expect(name_for_format("cat.jpeg", "image/jpeg", ".jpg")).toBe("cat.jpeg");
    expect(name_for_format("cat", "image/png", ".png")).toBe("cat.png");
  });
});

describe("zoom", () => {
  it("fits without enlarging", () => {
    expect(fit_zoom({ width: 100, height: 100 }, { width: 800, height: 600 })).toBe(1);
    expect(fit_zoom({ width: 2000, height: 1000 }, { width: 500, height: 500 })).toBe(0.25);
  });

  it("steps through the levels from any zoom", () => {
    expect(step_zoom(1, 1)).toBe(1.5);
    expect(step_zoom(1.2, -1)).toBe(1);
    expect(step_zoom(16, 1)).toBe(16);
  });
});
