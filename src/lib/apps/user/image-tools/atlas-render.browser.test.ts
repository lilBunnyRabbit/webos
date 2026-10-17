import { describe, expect, test } from "vitest";
import { draw_sheet } from "./atlas-render";

function source(): OffscreenCanvas {
  const canvas = new OffscreenCanvas(4, 4);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ff0000";
  context.fillRect(1, 1, 2, 2);
  context.fillStyle = "#0000ff";
  context.fillRect(2, 2, 1, 1);
  return canvas;
}

function pixel(canvas: OffscreenCanvas, x: number, y: number): number[] {
  return [...canvas.getContext("2d")!.getImageData(x, y, 1, 1).data];
}

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];
const CLEAR = [0, 0, 0, 0];

describe("draw_sheet", () => {
  test("draws the crop at its spot and repeats its edge pixels outward", () => {
    const crop = { x: 1, y: 1, w: 2, h: 2 };
    const sheet = draw_sheet({ w: 8, h: 8 }, [{ image: source(), crop, at: { x: 3, y: 3 } }], 2);
    expect(pixel(sheet, 3, 3)).toEqual(RED);
    expect(pixel(sheet, 4, 4)).toEqual(BLUE);
    expect(pixel(sheet, 4, 1)).toEqual(RED);
    expect(pixel(sheet, 6, 4)).toEqual(BLUE);
    expect(pixel(sheet, 4, 6)).toEqual(BLUE);
    expect(pixel(sheet, 6, 6)).toEqual(BLUE);
    expect(pixel(sheet, 1, 1)).toEqual(RED);
    expect(pixel(sheet, 0, 0)).toEqual(CLEAR);
    expect(pixel(sheet, 7, 7)).toEqual(CLEAR);
  });

  test("a preview scale shrinks the canvas", () => {
    const sheet = draw_sheet({ w: 400, h: 200 }, [], 0, 0.5);
    expect([sheet.width, sheet.height]).toEqual([200, 100]);
  });
});
