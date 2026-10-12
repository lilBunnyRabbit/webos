import { describe, expect, test } from "vitest";
import { CASCADE_OFFSET, WindowsHelper } from "./helper";

const container = { x: 0, y: 0, width: 1500, height: 800 };

describe("WindowsHelper.place", () => {
  test("first window: centred at a share of the area", () => {
    const bounds = WindowsHelper.place({ constraints: {}, container, sibling: null, frame: null });
    expect(bounds).toEqual({ width: 930, height: 560, x: 285, y: 96 });
  });

  test("first window respects the app's constraints", () => {
    const bounds = WindowsHelper.place({ constraints: { width: { max: 500 }, height: { min: 700 } }, container, sibling: null, frame: null });
    expect(bounds.width).toBe(500);
    expect(bounds.height).toBe(700);
  });

  test("reuses the remembered frame", () => {
    const frame = { x: 40, y: 50, width: 700, height: 500 };
    expect(WindowsHelper.place({ constraints: {}, container, sibling: null, frame })).toEqual(frame);
  });

  test("a frame from a bigger screen shrinks and moves back on screen", () => {
    const frame = { x: 2000, y: -100, width: 1800, height: 600 };
    expect(WindowsHelper.place({ constraints: {}, container, sibling: null, frame })).toEqual({ x: 0, y: 0, width: 1500, height: 600 });
  });

  test("a second window cascades from the app's frontmost one, ignoring the frame", () => {
    const sibling = { x: 100, y: 100, width: 600, height: 400 };
    const frame = { x: 0, y: 0, width: 300, height: 300 };
    expect(WindowsHelper.place({ constraints: {}, container, sibling, frame })).toEqual({
      x: 100 + CASCADE_OFFSET,
      y: 100 + CASCADE_OFFSET,
      width: 600,
      height: 400,
    });
  });

  test("a cascade that would overflow wraps to the top-left", () => {
    const sibling = { x: 880, y: 390, width: 600, height: 400 };
    expect(WindowsHelper.place({ constraints: {}, container, sibling, frame: null })).toEqual({ x: 0, y: 0, width: 600, height: 400 });
  });

  test("an unmeasured area falls back to a fixed size", () => {
    const bounds = WindowsHelper.place({ constraints: {}, container: { x: 0, y: 0, width: 0, height: 0 }, sibling: null, frame: null });
    expect(bounds.width).toBe(600);
    expect(bounds.height).toBe(400);
  });
});
