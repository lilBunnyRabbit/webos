import { expect, test } from "vitest";
import { clean_lines } from "./lines";
import { recognize } from "./ocr";

async function picture(lines: string[]): Promise<Blob> {
  const canvas = new OffscreenCanvas(640, 80 + lines.length * 56);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#000";
  context.font = "36px sans-serif";
  lines.forEach((line, index) => context.fillText(line, 40, 80 + index * 56));
  return canvas.convertToBlob({ type: "image/png" });
}

test("reads a printed list with the bundled core and language data, no network beyond this site", async () => {
  const messages: string[] = [];
  const text = await recognize(await picture(["- 2x mleko", "- kruh", "- 500 g moka"]), new AbortController().signal, {
    progress: () => {},
    message: (line) => messages.push(line),
  });
  expect(clean_lines(text).map((line) => line.toLowerCase())).toEqual(["2x mleko", "kruh", "500 g moka"]);
  expect(messages).toContain("Reading the photo");
}, 60_000);

test("stops when cancelled", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(recognize(await picture(["kruh"]), controller.signal, { progress: () => {}, message: () => {} })).rejects.toThrow();
});
