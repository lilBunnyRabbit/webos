import { LetterCircleP as ParkingIcon } from "phosphor-svelte";
import { expect, test } from "vitest";
import { icon_image } from "./icons";

test("an icon becomes a drawable image in the given colour", async () => {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const made = icon_image(ParkingIcon, "rgb(200, 30, 40)", () => resolve(made));
    made.onerror = reject;
  });
  expect(image.naturalWidth).toBe(96);
  expect(decodeURIComponent(image.src)).toContain('fill="rgb(200, 30, 40)"');

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const [r, g, b, a] = ctx.getImageData(48, 20, 1, 1).data;
  expect(a).toBeGreaterThan(200);
  expect([r, g, b]).toEqual([200, 30, 40]);
});
