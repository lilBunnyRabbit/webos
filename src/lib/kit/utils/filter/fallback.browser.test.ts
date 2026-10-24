import { expect, test } from "vitest";
import { canvas_filter_works, draw_filtered, FilterKind } from ".";

// What Safari does: the property exists, and drawing ignores it. Set before the probe, which runs once per page.
Object.defineProperty(OffscreenCanvasRenderingContext2D.prototype, "filter", { get: () => "none", set: () => {}, configurable: true });

const SIZE = 16;

function grey(): OffscreenCanvas {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgb(200 100 50)";
  context.fillRect(0, 0, SIZE, SIZE);
  return canvas;
}

test("the probe sees the ignored filter", () => {
  expect(canvas_filter_works()).toBe(false);
});

test("draw_filtered filters by hand inside the region, through the context's transform and compositing", () => {
  const context = new OffscreenCanvas(SIZE, SIZE).getContext("2d", { willReadFrequently: true })!;
  context.fillStyle = "rgb(0 0 255)";
  context.fillRect(0, 0, SIZE, SIZE);
  context.translate(4, 0);
  context.globalCompositeOperation = "source-over";
  draw_filtered(context, [{ kind: FilterKind.BRIGHTNESS, percent: 50 }], (target) => target.drawImage(grey(), -4, 0), {
    x: 0,
    y: 0,
    width: SIZE,
    height: SIZE / 2,
  });
  const top = context.getImageData(0, 0, 1, 1).data;
  const bottom = context.getImageData(0, SIZE - 1, 1, 1).data;
  expect([...top]).toEqual([100, 50, 25, 255]);
  expect([...bottom]).toEqual([0, 0, 255, 255]);
  expect(context.getTransform().e).toBe(4);
});
