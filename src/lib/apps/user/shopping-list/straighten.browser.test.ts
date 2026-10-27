import { expect, test } from "vitest";
import { find_paper, homography, project, to_gray, type Quad } from "$kit/utils/perspective";
import { read_list } from "./ocr";

const ITEMS = ["2x milk", "bread", "500 g flour", "eggs", "butter", "apples", "rice", "coffee", "tomatoes", "cheese"];
const quiet = { progress: () => {}, message: () => {} };
const signal = () => new AbortController().signal;

/** A printed list on paper, photographed turned and at an angle on a dark table. */
async function photo(quad: Quad, width = 1000, height = 1100): Promise<Blob> {
  const list = new OffscreenCanvas(700, 120 + ITEMS.length * 60);
  const context = list.getContext("2d")!;
  context.fillStyle = "#f6f4ee";
  context.fillRect(0, 0, list.width, list.height);
  context.fillStyle = "#1a1a1a";
  context.font = "38px sans-serif";
  ITEMS.forEach((item, index) => context.fillText(item, 60, 100 + index * 60));
  const flat = context.getImageData(0, 0, list.width, list.height);
  const to_flat = homography(quad, [
    { x: 0, y: 0 },
    { x: flat.width, y: 0 },
    { x: flat.width, y: flat.height },
    { x: 0, y: flat.height },
  ]);
  const out = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const point = project(to_flat, { x: x + 0.5, y: y + 0.5 });
      const at = (y * width + x) * 4;
      const inside = point.x >= 0 && point.y >= 0 && point.x < flat.width && point.y < flat.height;
      const from = inside ? (Math.floor(point.y) * flat.width + Math.floor(point.x)) * 4 : -1;
      out.data.set(inside ? flat.data.subarray(from, from + 3) : [70, 55, 40], at);
      out.data[at + 3] = 255;
    }
  }
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.putImageData(out, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.9 });
}

async function paper(source: Blob): Promise<Quad> {
  const bitmap = await createImageBitmap(source);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
  return find_paper(to_gray(pixels.data, pixels.width, pixels.height))!;
}

const read_right = (lines: string[]) => ITEMS.filter((item) => lines.some((line) => line.toLowerCase() === item)).length;

// Measured 2026-10-27 before wiring the quad crop: as photographed, 5 of 10; straightened, 10 of 10. A list that's only
// skewed (not turned) read 10 of 10 both ways.
test("a list photographed turned and at an angle reads in full once straightened", async () => {
  const turned: Quad = [
    { x: 240, y: 80 },
    { x: 900, y: 260 },
    { x: 720, y: 1040 },
    { x: 80, y: 820 },
  ];
  const shot = await photo(turned);
  expect(read_right(await read_list(shot, null, signal(), quiet, []))).toBeLessThan(ITEMS.length);
  expect(read_right(await read_list(shot, await paper(shot), signal(), quiet, []))).toBe(ITEMS.length);
}, 120_000);
