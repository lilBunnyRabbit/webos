import { beforeAll, beforeEach, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { PhotoSide } from "./data";
import { delete_photos, encode_photo, PHOTOS_DIR, read_photo, write_photo } from "./photos";

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

async function png(width: number, height: number): Promise<File> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#c33";
  context.fillRect(0, 0, width, height);
  return new File([await canvas.convertToBlob({ type: "image/png" })], "card.png", { type: "image/png" });
}

test("a photo is downscaled to 1600px, stored as WebP in the app's data folder and deleted with its card", async () => {
  const photo = await encode_photo(await png(3000, 2000));
  expect(photo.type).toBe("image/webp");
  await write_photo(files, "abc", PhotoSide.FRONT, photo);
  expect(PHOTOS_DIR).toBe("/var/lib/apps/cards/photos");

  const stored = await read_photo(files, "abc", PhotoSide.FRONT);
  const bitmap = await createImageBitmap(stored!);
  expect([bitmap.width, bitmap.height]).toEqual([1600, 1067]);
  expect(await read_photo(files, "abc", PhotoSide.BACK)).toBeNull();

  await delete_photos(files, "abc");
  expect(await read_photo(files, "abc", PhotoSide.FRONT)).toBeNull();
});

test("a small photo keeps its size", async () => {
  const bitmap = await createImageBitmap(await encode_photo(await png(400, 250)));
  expect([bitmap.width, bitmap.height]).toEqual([400, 250]);
});
