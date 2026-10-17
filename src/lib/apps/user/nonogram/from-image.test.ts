import { describe, expect, test } from "vitest";
import {
  assign_inks,
  bw_picture,
  colour_picture,
  downscale,
  grid_size,
  kmeans,
  make_unique,
  otsu,
  pick_flips,
  to_oklab,
  type Rgb,
} from "./from-image";
import { analyze_solution, Ink, Verdict } from "./puzzle";

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const RED: Rgb = [220, 30, 30];
const BLUE: Rgb = [30, 60, 220];

function pixels(width: number, height: number, colour: (x: number, y: number) => [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(colour(x, y), (y * width + x) * 4);
  return { width, height, data };
}

describe("grid_size", () => {
  test("keeps the aspect with the long side fixed", () => {
    expect(grid_size(400, 200, 20)).toEqual({ width: 20, height: 10 });
    expect(grid_size(300, 900, 30)).toEqual({ width: 10, height: 30 });
    expect(grid_size(1000, 10, 10)).toEqual({ width: 10, height: 2 });
  });
});

describe("downscale", () => {
  test("averages each cell's pixels and reads transparency as white", () => {
    const image = pixels(4, 2, (x) => (x < 2 ? [0, 0, 0, 255] : [0, 0, 0, 0]));
    expect(downscale(image, 2, 1)).toEqual([BLACK, WHITE]);
    const stripes = pixels(2, 1, (x) => (x === 0 ? [0, 0, 0, 255] : [255, 255, 255, 255]));
    expect(downscale(stripes, 1, 1)).toEqual([[127.5, 127.5, 127.5]]);
  });

  test("upscales a tiny image by repeating pixels", () => {
    const image = pixels(1, 1, () => [10, 20, 30, 255]);
    expect(downscale(image, 2, 2)).toEqual(new Array(4).fill([10, 20, 30]));
  });
});

describe("otsu", () => {
  test("cuts between two groups", () => {
    const threshold = otsu([10, 12, 15, 20, 200, 210, 220]);
    expect(threshold).toBeGreaterThanOrEqual(20);
    expect(threshold).toBeLessThan(200);
  });
});

describe("kmeans", () => {
  test("finds the groups of colours", () => {
    const points = [WHITE, WHITE, RED, RED, BLUE].map(to_oklab);
    const { labels } = kmeans(points, 3);
    expect(labels[0]).toBe(labels[1]);
    expect(labels[2]).toBe(labels[3]);
    expect(new Set(labels).size).toBe(3);
  });
});

describe("assign_inks", () => {
  test("gives each colour its own closest ink", () => {
    const inks = [
      { ink: Ink.ERROR, lab: to_oklab([200, 40, 40]) },
      { ink: Ink.INFO, lab: to_oklab([40, 80, 200]) },
      { ink: Ink.SUCCESS, lab: to_oklab([40, 180, 60]) },
    ];
    expect(assign_inks([to_oklab(BLUE), to_oklab(RED)], inks)).toEqual([Ink.INFO, Ink.ERROR]);
    expect(assign_inks([to_oklab(RED), to_oklab(RED)], inks)[0]).toBe(Ink.ERROR);
  });
});

describe("bw_picture", () => {
  test("inks dark cells and prices flips by distance to the threshold", () => {
    const picture = bw_picture([BLACK, [120, 120, 120], WHITE], 3, 1, 127);
    expect(picture.cells).toEqual([1, 1, 0]);
    expect(picture.costs[1 * 2]).toBeLessThan(picture.costs[0]);
  });
});

describe("colour_picture", () => {
  test("leaves the lightest colour empty and maps the rest onto inks", () => {
    const inks = [
      { ink: Ink.ERROR, lab: to_oklab([200, 40, 40]) },
      { ink: Ink.INFO, lab: to_oklab([40, 80, 200]) },
    ];
    const picture = colour_picture([WHITE, RED, BLUE, WHITE], 4, 1, 3, inks);
    expect(picture.cells[0]).toBe(0);
    expect(picture.cells[3]).toBe(0);
    expect(picture.palette[picture.cells[1] - 1]).toBe(Ink.ERROR);
    expect(picture.palette[picture.cells[2] - 1]).toBe(Ink.INFO);
  });
});

describe("pick_flips", () => {
  test("picks the cell closest to the other value and skips tried ones", () => {
    const picture = bw_picture([BLACK, [120, 120, 120], WHITE, WHITE], 2, 2, 127);
    expect(pick_flips(picture, picture.cells, [0, 1], null, new Set())).toEqual([{ index: 1, value: 0 }]);
    expect(pick_flips(picture, picture.cells, [0, 1], null, new Set([1]))).toEqual([{ index: 0, value: 0 }]);
    expect(pick_flips(picture, picture.cells, [1], null, new Set([1]))).toEqual([]);
    expect(pick_flips(picture, picture.cells, [0, 1, 2], null, new Set(), 2).map(({ index }) => index)).toEqual([1, 0]);
  });
});

describe("make_unique", () => {
  const run = (width: number, height: number) => (cells: readonly number[]) =>
    Promise.resolve(analyze_solution(width, height, [Ink.FOREGROUND], cells));

  test("leaves a unique picture alone", async () => {
    const picture = bw_picture([BLACK, BLACK, BLACK, WHITE], 2, 2, 127);
    const result = await make_unique(picture, run(2, 2));
    expect(result.flipped).toEqual([]);
    expect(result.cells).toEqual([1, 1, 1, 0]);
  });

  test("flips an ambiguous diagonal until one picture fits", async () => {
    const picture = bw_picture([BLACK, [150, 150, 150], WHITE, [60, 60, 60]], 2, 2, 127);
    const rounds: number[][] = [];
    const result = await make_unique(picture, run(2, 2), (cells) => rounds.push([...cells]));
    expect(result.verdict === Verdict.LOGIC || result.verdict === Verdict.UNIQUE).toBe(true);
    expect(result.flipped).toEqual([1]);
    expect(result.cells).toEqual([1, 1, 0, 1]);
    expect(rounds).toHaveLength(1);
  });

  test("stops when told to", async () => {
    const picture = bw_picture([BLACK, WHITE, WHITE, BLACK], 2, 2, 127);
    await expect(make_unique(picture, () => Promise.reject(new Error("stop")))).rejects.toThrow("stop");
  });
});
