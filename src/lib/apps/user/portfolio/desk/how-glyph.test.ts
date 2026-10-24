import { describe, expect, test } from "vitest";
import { glyph_dots } from "./how-glyph";

function square_mask(size: number, from: number, to: number) {
  const alpha = new Uint8Array(size * size);
  for (let y = from; y < to; y++) for (let x = from; x < to; x++) alpha[y * size + x] = 255;
  return { width: size, height: size, alpha };
}

describe("glyph_dots", () => {
  test("a dot for each covered cell, none for empty ones", () => {
    const grid = glyph_dots(square_mask(100, 0, 50), 4);
    expect(grid.rows).toBe(4);
    expect(grid.dots.map((dot) => [dot.x, dot.y])).toEqual([
      [0.5, 0.5],
      [1.5, 0.5],
      [0.5, 1.5],
      [1.5, 1.5],
    ]);
  });

  test("a thinly covered cell stays empty", () => {
    expect(glyph_dots(square_mask(100, 0, 5), 4).dots).toEqual([]);
  });

  test("rows follow the mask's aspect", () => {
    expect(glyph_dots({ width: 200, height: 100, alpha: new Uint8Array(20000) }, 10).rows).toBe(5);
  });

  test("delays sweep left to right within 0–1, and are stable for a seed", () => {
    const grid = glyph_dots(square_mask(100, 0, 100), 5);
    const first_row = grid.dots.filter((dot) => dot.y === 0.5).map((dot) => dot.delay);
    expect(first_row).toEqual([...first_row].sort((a, b) => a - b));
    expect(grid.dots.every((dot) => dot.delay >= 0 && dot.delay <= 1)).toBe(true);
    expect(glyph_dots(square_mask(100, 0, 100), 5).dots).toEqual(grid.dots);
  });
});
