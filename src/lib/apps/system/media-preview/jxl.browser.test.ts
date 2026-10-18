import { expect, test } from "vitest";
import { encode } from "$kit/utils/codecs";
import { is_jxl, jxl_to_png } from "./jxl";

test("knows a JPEG XL by its type or its name", () => {
  expect(is_jxl(new File([], "a.bin", { type: "image/jxl" }))).toBe(true);
  expect(is_jxl(new File([], "Photo.JXL"))).toBe(true);
  expect(is_jxl(new File([], "a.png", { type: "image/png" }))).toBe(false);
});

test("turns a JPEG XL into a PNG the <img> can show", async () => {
  const { blob } = await encode("jxl", new ImageData(12, 8));
  const png = await jxl_to_png(new File([blob], "a.jxl", { type: "image/jxl" }));
  expect(png.type).toBe("image/png");
  const bitmap = await createImageBitmap(png);
  expect([bitmap.width, bitmap.height]).toEqual([12, 8]);
}, 60_000);
