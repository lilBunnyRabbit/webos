import { describe, expect, test } from "vitest";
import { homography, page_size, project, warp, type Quad, type Rgba } from "$kit/utils/perspective";
import { apply_filter, PageFilter } from "./warp";

const SKEWED: Quad = [
  { x: 40, y: 30 },
  { x: 260, y: 50 },
  { x: 240, y: 230 },
  { x: 20, y: 200 },
];

/** A 100 × 100 page split in a dark left half and a light right half, photographed at `quad` on a mid-grey table. */
function photographed(quad: Quad, width = 300, height = 260): Rgba {
  const to_page = homography(quad, [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ]);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const page = project(to_page, { x: x + 0.5, y: y + 0.5 });
      const on_page = page.x >= 0 && page.y >= 0 && page.x <= 100 && page.y <= 100;
      const value = on_page ? (page.x < 50 ? 30 : 230) : 128;
      data.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

const at = (image: Rgba, x: number, y: number) => image.data[(y * image.width + x) * 4];

describe("page_size", () => {
  test("takes the longer of each pair of opposite edges", () => {
    const size = page_size(SKEWED);
    expect(size.width).toBe(Math.round(Math.hypot(220, 30)));
    expect(size.height).toBe(Math.round(Math.hypot(20, 180)));
  });

  test("scales a big page down to the long side", () => {
    const big: Quad = [
      { x: 0, y: 0 },
      { x: 3000, y: 0 },
      { x: 3000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    expect(page_size(big, 2400)).toEqual({ width: 1800, height: 2400 });
  });
});

test("warp pulls a skewed page flat: each half lands in its half", () => {
  const flat = warp(photographed(SKEWED), SKEWED, { width: 200, height: 200 });
  expect(flat.width).toBe(200);
  for (const y of [10, 100, 190]) {
    expect(at(flat, 20, y)).toBeLessThan(60);
    expect(at(flat, 180, y)).toBeGreaterThan(200);
  }
});

describe("apply_filter", () => {
  function shaded_text(): Rgba {
    const width = 200;
    const height = 100;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const paper = x < 100 ? 230 : 120;
        const ink = y > 45 && y < 52 && x % 50 > 10 && x % 50 < 40;
        const value = ink ? paper * 0.35 : paper;
        data.set([value, value * 0.9, value * 0.8, 255], (y * width + x) * 4);
      }
    }
    return { width, height, data };
  }

  test("B&W keeps ink black and a shadowed half of the page white", () => {
    const bw = apply_filter(shaded_text(), PageFilter.BW);
    expect(at(bw, 20, 48)).toBe(0);
    expect(at(bw, 120, 48)).toBe(0);
    expect(at(bw, 20, 20)).toBe(255);
    expect(at(bw, 150, 20)).toBe(255);
  });

  test("Gray turns the paper white and stays gray", () => {
    const gray = apply_filter(shaded_text(), PageFilter.GRAY);
    expect(at(gray, 20, 20)).toBe(255);
    const pixel = [...gray.data.slice(0, 3)];
    expect(new Set(pixel).size).toBe(1);
  });

  test("Color is the photo as it is", () => {
    const image = shaded_text();
    expect(apply_filter(image, PageFilter.COLOR)).toBe(image);
  });
});
