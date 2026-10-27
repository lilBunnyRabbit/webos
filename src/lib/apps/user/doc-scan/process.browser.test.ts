import { expect, test } from "vitest";
import type { Quad } from "$kit/utils/perspective";
import { detect, straighten } from "./process";
import { PageFilter } from "./warp";

const PAGE: Quad = [
  { x: 120, y: 90 },
  { x: 520, y: 130 },
  { x: 560, y: 690 },
  { x: 80, y: 640 },
];

async function photo(): Promise<Blob> {
  const canvas = new OffscreenCanvas(640, 760);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#3a2c20";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f4f2ea";
  context.beginPath();
  PAGE.forEach(({ x, y }, index) => (index ? context.lineTo(x, y) : context.moveTo(x, y)));
  context.fill();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

test("the worker finds the page in a photo and straightens it", async () => {
  const source = await photo();
  const found = await detect(source);
  expect(found).toMatchObject({ width: 640, height: 760 });
  found.quad!.forEach((corner, index) => expect(Math.hypot(corner.x - PAGE[index].x, corner.y - PAGE[index].y)).toBeLessThan(8));

  const color = await straighten(source, found.quad!, PageFilter.COLOR);
  expect(color.blob.type).toBe("image/jpeg");
  expect(color.height).toBeGreaterThan(color.width);
  const bw = await straighten(source, found.quad!, PageFilter.BW, 300);
  expect(bw.blob.type).toBe("image/png");
  expect(Math.max(bw.width, bw.height)).toBe(300);
});

test("a file that isn't a picture rejects", async () => {
  await expect(detect(new Blob(["not a picture"], { type: "image/png" }))).rejects.toThrow("couldn't be read");
});
