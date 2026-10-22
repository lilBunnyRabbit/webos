import { describe, expect, test } from "vitest";
import { apply_filter_steps, canvas_filter_works, draw_filtered, FilterKind, type FilterStep } from ".";

const SIZE = 48;

function source(): OffscreenCanvas {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const context = canvas.getContext("2d")!;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      context.fillStyle = `rgb(${(x * 37) % 256} ${(y * 53) % 256} ${((x + y) * 29) % 256})`;
      context.fillRect(x, y, 1, 1);
    }
  }
  return canvas;
}

function native(steps: FilterStep[], image: OffscreenCanvas): Uint8ClampedArray {
  const context = new OffscreenCanvas(SIZE, SIZE).getContext("2d", { willReadFrequently: true })!;
  draw_filtered(context, steps, (target) => target.drawImage(image, 0, 0));
  return context.getImageData(0, 0, SIZE, SIZE).data;
}

function by_hand(steps: FilterStep[], image: OffscreenCanvas): Uint8ClampedArray {
  const context = new OffscreenCanvas(SIZE, SIZE).getContext("2d", { willReadFrequently: true })!;
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, SIZE, SIZE);
  apply_filter_steps(pixels, steps);
  return pixels.data;
}

function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): { max: number; mean: number } {
  let max = 0;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const delta = Math.abs(a[i] - b[i]);
    max = Math.max(max, delta);
    sum += delta;
  }
  return { max, mean: sum / a.length };
}

describe("hand-filtered pixels match Chromium's canvas filter", () => {
  test("the probe sees Chromium's filter working", () => {
    expect(canvas_filter_works()).toBe(true);
  });

  const colour_cases: [string, FilterStep[]][] = [
    ["brightness", [{ kind: FilterKind.BRIGHTNESS, percent: 140 }]],
    ["contrast", [{ kind: FilterKind.CONTRAST, percent: 60 }]],
    ["saturate", [{ kind: FilterKind.SATURATE, percent: 170 }]],
    ["hue-rotate", [{ kind: FilterKind.HUE_ROTATE, degrees: 75 }]],
    ["grayscale", [{ kind: FilterKind.GRAYSCALE, percent: 60 }]],
    ["sepia", [{ kind: FilterKind.SEPIA, percent: 80 }]],
    ["invert", [{ kind: FilterKind.INVERT, percent: 100 }]],
    [
      "the editor's whole chain",
      [
        { kind: FilterKind.BRIGHTNESS, percent: 110 },
        { kind: FilterKind.CONTRAST, percent: 120 },
        { kind: FilterKind.SATURATE, percent: 80 },
        { kind: FilterKind.HUE_ROTATE, degrees: -20 },
        { kind: FilterKind.SEPIA, percent: 30 },
      ],
    ],
  ];

  for (const [name, steps] of colour_cases) {
    test(name, () => {
      const image = source();
      const { max } = difference(native(steps, image), by_hand(steps, image));
      expect(max).toBeLessThanOrEqual(3);
    });
  }

  test.each([1, 3, 8.5])("blur %spx", (radius) => {
    const image = source();
    const steps: FilterStep[] = [{ kind: FilterKind.SEPIA, percent: 40 }, { kind: FilterKind.BLUR, radius }];
    const { mean, max } = difference(native(steps, image), by_hand(steps, image));
    expect(mean).toBeLessThan(0.5);
    expect(max).toBeLessThanOrEqual(3);
  });
});

