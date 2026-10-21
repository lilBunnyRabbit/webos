import { describe, expect, test } from "vitest";
import { GUESS_SIZE } from "./ink";
import { render_snapshot, snapshot_png } from "./snapshot";

describe("snapshot", () => {
  test("is a PNG cropped to the ink, black on white", async () => {
    const strokes = [
      [
        { x: 100, y: 100 },
        { x: 900, y: 500 },
      ],
    ];
    const blob = await snapshot_png(strokes, GUESS_SIZE);
    expect(blob?.type).toBe("image/png");

    const bitmap = await createImageBitmap(blob!);
    expect(Math.max(bitmap.width, bitmap.height)).toBe(512);

    const canvas = render_snapshot(strokes, GUESS_SIZE)!;
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
    expect([...pixels.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    const middle = (Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2)) * 4;
    expect(pixels[middle]).toBeLessThan(64);
  });

  test("nothing drawn is no snapshot", async () => {
    expect(await snapshot_png([], GUESS_SIZE)).toBeNull();
  });
});
