import { describe, expect, test } from "vitest";
import { BOARD, GUESS_SIZE, ink_bounds, SAVE_SIZE, snapshot_frame, to_board } from "./ink";

describe("ink_bounds", () => {
  test("covers every point plus half the line", () => {
    expect(
      ink_bounds(
        [
          [{ x: 100, y: 200 }],
          [
            { x: 300, y: 250 },
            { x: 150, y: 400 },
          ],
        ],
        10
      )
    ).toEqual({
      x: 95,
      y: 195,
      width: 210,
      height: 210,
    });
  });

  test("nothing drawn has no bounds", () => {
    expect(ink_bounds([])).toBeNull();
    expect(ink_bounds([[]])).toBeNull();
  });
});

describe("snapshot_frame", () => {
  test("nothing drawn has no snapshot", () => {
    expect(snapshot_frame([], GUESS_SIZE)).toBeNull();
  });

  test("a drawing over the whole board scales down to 512 on its longest side", () => {
    const frame = snapshot_frame(
      [
        [
          { x: 0, y: 0 },
          { x: BOARD, y: BOARD / 2 },
        ],
      ],
      GUESS_SIZE
    )!;
    expect(Math.max(frame.width, frame.height)).toBe(512);
    expect(frame.width).toBeGreaterThan(frame.height);
  });

  test("a small doodle scales up to 384 and keeps its line thin", () => {
    const frame = snapshot_frame(
      [
        [
          { x: 500, y: 500 },
          { x: 540, y: 520 },
        ],
      ],
      GUESS_SIZE
    )!;
    expect(Math.max(frame.width, frame.height)).toBe(384);
    expect(frame.line).toBeLessThanOrEqual(384 * 0.025);
  });

  test("a mid-sized drawing keeps its scale", () => {
    const frame = snapshot_frame(
      [
        [
          { x: 300, y: 300 },
          { x: 650, y: 650 },
        ],
      ],
      GUESS_SIZE
    )!;
    expect(frame.scale).toBe(1);
  });

  test("the margin keeps the ink off the edge", () => {
    const frame = snapshot_frame(
      [
        [
          { x: 200, y: 200 },
          { x: 800, y: 800 },
        ],
      ],
      SAVE_SIZE,
      12
    )!;
    expect(frame.box.x).toBeLessThan(200 - 6);
    expect(frame.box.x + frame.box.width).toBeGreaterThan(800 + 6);
    expect(frame.width).toBe(1024);
  });
});

describe("to_board", () => {
  test("maps the element to board units and clamps outside it", () => {
    const rect = { x: 10, y: 20, width: 200, height: 200 };
    expect(to_board({ x: 110, y: 120 }, rect)).toEqual({ x: BOARD / 2, y: BOARD / 2 });
    expect(to_board({ x: -50, y: 900 }, rect)).toEqual({ x: 0, y: BOARD });
  });
});
