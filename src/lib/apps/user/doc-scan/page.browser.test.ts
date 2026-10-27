import { expect, test } from "vitest";
import { ScanPage } from "./page.svelte";
import { PageFilter } from "./warp";

async function photo(): Promise<Blob> {
  const canvas = new OffscreenCanvas(480, 600);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#3a2c20";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#f4f2ea";
  context.fillRect(80, 70, 320, 440);
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
}

test("every caller shares one prepare, and a render after it has a result", async () => {
  const page = new ScanPage(await photo(), "page.jpg", PageFilter.COLOR);
  const first = page.prepare();
  expect(page.prepare()).toBe(first);
  expect(await page.render()).toBeNull();
  await page.prepare();
  const blob = await page.render();
  expect(blob).toBeInstanceOf(Blob);
  expect(page.current).toBe(true);
  page.dispose();
});

test("a page disposed while it prepares stops and keeps no result", async () => {
  const page = new ScanPage(await photo(), "page.jpg", PageFilter.COLOR);
  const prepared = page.prepare();
  page.dispose();
  await prepared;
  expect(page.disposed).toBe(true);
  expect(page.quad).toBeNull();
  expect(page.result_url).toBeNull();
  expect(await page.render()).toBeNull();
});

test("a render overtaken by a newer one resolves with the newer result", async () => {
  const page = new ScanPage(await photo(), "page.jpg", PageFilter.COLOR);
  await page.prepare();
  page.whole();
  const older = page.render();
  page.filter = PageFilter.BW;
  const newer = page.render();
  const [a, b] = await Promise.all([older, newer]);
  expect(a).toBe(b);
  expect(b?.type).toBe("image/png");
  expect(page.current).toBe(true);
  expect(page.busy).toBe(false);
  page.dispose();
});
