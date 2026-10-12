import { describe, expect, test } from "vitest";
import { channel_tolerance, flood_fill, type Pixels, type Rgba } from "./flood-fill";

const RED: Rgba = [255, 0, 0, 255];
const WHITE: Rgba = [255, 255, 255, 255];
const BLACK: Rgba = [0, 0, 0, 255];

function grid(rows: string[], palette: Record<string, Rgba>): Pixels {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => [...row].forEach((key, x) => data.set(palette[key], (y * width + x) * 4)));
  return { data, width, height };
}

function read(pixels: Pixels, palette: Record<string, Rgba>): string[] {
  const keys = Object.entries(palette);
  const rows: string[] = [];
  for (let y = 0; y < pixels.height; y++) {
    let row = "";
    for (let x = 0; x < pixels.width; x++) {
      const offset = (y * pixels.width + x) * 4;
      const pixel = pixels.data.slice(offset, offset + 4);
      row += keys.find(([, color]) => color.every((channel, i) => channel === pixel[i]))?.[0] ?? "?";
    }
    rows.push(row);
  }
  return rows;
}

const PALETTE = { ".": WHITE, "#": BLACK, r: RED };

describe("flood_fill", () => {
  test("fills the enclosed region and stops at walls", () => {
    const pixels = grid(["#####", "#...#", "#.#.#", "#...#", "#####"], PALETTE);
    expect(flood_fill(pixels, 1, 1, RED)).toBe(8);
    expect(read(pixels, PALETTE)).toEqual(["#####", "#rrr#", "#r#r#", "#rrr#", "#####"]);
  });

  test("is 4-connected: a diagonal gap doesn't leak", () => {
    const pixels = grid([".#.", "#..", "..."], PALETTE);
    flood_fill(pixels, 0, 0, RED);
    expect(read(pixels, PALETTE)).toEqual(["r#.", "#..", "..."]);
  });

  test("fills a whole open canvas", () => {
    const pixels = grid(["....", "....", "...."], PALETTE);
    expect(flood_fill(pixels, 2, 1, RED)).toBe(12);
  });

  test("reaches into concave pockets above and below the seed run", () => {
    const pixels = grid([".#.#.", ".#.#.", "....."], PALETTE);
    flood_fill(pixels, 0, 2, RED);
    expect(read(pixels, PALETTE)).toEqual(["r#r#r", "r#r#r", "rrrrr"]);
  });

  test("filling with the same colour terminates and repaints the region", () => {
    const pixels = grid(["..", ".."], PALETTE);
    expect(flood_fill(pixels, 0, 0, WHITE)).toBe(4);
  });

  test("tolerance lets near colours join the region", () => {
    const near: Rgba = [240, 240, 240, 255];
    const palette = { ...PALETTE, n: near };
    const strict = grid([".n#"], palette);
    flood_fill(strict, 0, 0, RED, 0);
    expect(read(strict, palette)).toEqual(["rn#"]);

    const loose = grid([".n#"], palette);
    flood_fill(loose, 0, 0, RED, 10);
    expect(read(loose, palette)).toEqual(["rr#"]);
  });

  test("compares alpha too", () => {
    const clear: Rgba = [255, 255, 255, 0];
    const palette = { ...PALETTE, c: clear };
    const pixels = grid([".c"], palette);
    flood_fill(pixels, 0, 0, RED);
    expect(read(pixels, palette)).toEqual(["rc"]);
  });

  test("a seed outside the canvas paints nothing", () => {
    const pixels = grid([".."], PALETTE);
    expect(flood_fill(pixels, 5, 0, RED)).toBe(0);
    expect(flood_fill(pixels, -1, 0, RED)).toBe(0);
  });
});

describe("channel_tolerance", () => {
  test("maps percent to a channel difference and clamps", () => {
    expect(channel_tolerance(0)).toBe(0);
    expect(channel_tolerance(100)).toBe(255);
    expect(channel_tolerance(50)).toBe(128);
    expect(channel_tolerance(-5)).toBe(0);
    expect(channel_tolerance(500)).toBe(255);
  });
});
