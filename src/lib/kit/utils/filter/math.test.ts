import { describe, expect, test } from "vitest";
import { apply_filter_steps, filter_css, FilterKind, gauss_boxes, type FilterStep, type Pixels } from "./math";

function pixel(r: number, g: number, b: number, a = 255): Pixels {
  return { data: new Uint8ClampedArray([r, g, b, a]), width: 1, height: 1 };
}

function run(source: Pixels, steps: FilterStep[]): number[] {
  apply_filter_steps(source, steps);
  return [...source.data];
}

describe("filter_css", () => {
  test("writes CSS units and none for no steps", () => {
    expect(filter_css([])).toBe("none");
    expect(
      filter_css([
        { kind: FilterKind.BRIGHTNESS, percent: 120 },
        { kind: FilterKind.HUE_ROTATE, degrees: -30 },
        { kind: FilterKind.BLUR, radius: 1.5 },
      ])
    ).toBe("brightness(120%) hue-rotate(-30deg) blur(1.5px)");
  });
});

describe("colour steps", () => {
  test("brightness scales each channel", () => {
    expect(run(pixel(200, 100, 50), [{ kind: FilterKind.BRIGHTNESS, percent: 50 }])).toEqual([100, 50, 25, 255]);
    expect(run(pixel(200, 100, 50), [{ kind: FilterKind.BRIGHTNESS, percent: 200 }])).toEqual([255, 200, 100, 255]);
  });

  test("contrast pivots around the middle grey", () => {
    expect(run(pixel(20, 100, 200), [{ kind: FilterKind.CONTRAST, percent: 150 }])).toEqual([0, 86, 236, 255]);
    expect(run(pixel(0, 255, 100), [{ kind: FilterKind.CONTRAST, percent: 0 }])).toEqual([128, 128, 128, 255]);
  });

  test("grayscale and saturate 0 use the spec's luminance weights", () => {
    expect(run(pixel(255, 0, 0), [{ kind: FilterKind.GRAYSCALE, percent: 100 }])).toEqual([54, 54, 54, 255]);
    expect(run(pixel(255, 0, 0), [{ kind: FilterKind.SATURATE, percent: 0 }])).toEqual([54, 54, 54, 255]);
  });

  test("sepia 100% of white is the spec's warm tint", () => {
    expect(run(pixel(255, 255, 255), [{ kind: FilterKind.SEPIA, percent: 100 }])).toEqual([255, 255, 239, 255]);
  });

  test("hue-rotate 180° of red, clamped per channel", () => {
    expect(run(pixel(255, 0, 0), [{ kind: FilterKind.HUE_ROTATE, degrees: 180 }])).toEqual([0, 109, 109, 255]);
    expect(run(pixel(12, 140, 230), [{ kind: FilterKind.HUE_ROTATE, degrees: 360 }])).toEqual([12, 140, 230, 255]);
  });

  test("invert flips around the amount", () => {
    expect(run(pixel(255, 0, 100), [{ kind: FilterKind.INVERT, percent: 100 }])).toEqual([0, 255, 155, 255]);
  });

  test("clamps between steps, as a filter chain does", () => {
    expect(
      run(pixel(200, 200, 200), [
        { kind: FilterKind.BRIGHTNESS, percent: 200 },
        { kind: FilterKind.BRIGHTNESS, percent: 50 },
      ])
    ).toEqual([128, 128, 128, 255]);
  });

  test("leaves alpha and transparent pixels alone", () => {
    expect(run(pixel(200, 100, 50, 128), [{ kind: FilterKind.BRIGHTNESS, percent: 50 }])).toEqual([100, 50, 25, 128]);
    expect(run(pixel(200, 100, 50, 0), [{ kind: FilterKind.BRIGHTNESS, percent: 50 }])).toEqual([200, 100, 50, 0]);
  });
});

describe("blur", () => {
  test("box widths follow the spec: none below one pixel, even widths lean left then right", () => {
    expect(gauss_boxes(0.5)).toEqual([]);
    expect(gauss_boxes(1)).toEqual([
      { before: 1, after: 0 },
      { before: 0, after: 1 },
      { before: 1, after: 1 },
    ]);
    expect(gauss_boxes(2.9)).toEqual([
      { before: 2, after: 2 },
      { before: 2, after: 2 },
      { before: 2, after: 2 },
    ]);
  });

  test("spreads one dot symmetrically and keeps its mass", () => {
    const size = 21;
    const image: Pixels = { data: new Uint8ClampedArray(size * size * 4), width: size, height: size };
    const centre = (10 * size + 10) * 4;
    image.data.set([255, 0, 0, 255], centre);
    apply_filter_steps(image, [{ kind: FilterKind.BLUR, radius: 2 }]);
    const alpha = (x: number, y: number) => image.data[(y * size + x) * 4 + 3];
    let total = 0;
    for (let i = 3; i < image.data.length; i += 4) total += image.data[i];
    expect(Math.abs(total - 255)).toBeLessThan(25);
    expect(alpha(8, 10)).toBe(alpha(12, 10));
    expect(alpha(10, 8)).toBe(alpha(10, 12));
    expect(alpha(10, 10)).toBeGreaterThan(alpha(12, 10));
    expect(image.data[centre]).toBe(255);
    expect(image.data[centre + 1]).toBe(0);
  });

  test("keeps a flat colour flat away from the edges and fades into transparent at them", () => {
    const size = 30;
    const image: Pixels = { data: new Uint8ClampedArray(size * size * 4), width: size, height: size };
    for (let i = 0; i < image.data.length; i += 4) image.data.set([40, 160, 90, 255], i);
    apply_filter_steps(image, [{ kind: FilterKind.BLUR, radius: 2 }]);
    const middle = (15 * size + 15) * 4;
    expect([...image.data.slice(middle, middle + 4)]).toEqual([40, 160, 90, 255]);
    expect(image.data[3]).toBeLessThan(128);
    expect([...image.data.slice(0, 3)]).toEqual([40, 160, 90]);
  });
});
