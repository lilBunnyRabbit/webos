import { expect, test } from "vitest";
import { read_list } from "./ocr";

const quiet = { progress: () => {}, message: () => {} };
const signal = () => new AbortController().signal;

/** A printed list on white, drawn `turn` degrees clockwise. */
async function picture(lines: string[], turn = 0, type = "image/png"): Promise<Blob> {
  const width = 640;
  const height = 80 + lines.length * 56;
  const sideways = turn % 180 !== 0;
  const canvas = new OffscreenCanvas(sideways ? height : width, sideways ? width : height);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((turn * Math.PI) / 180);
  context.translate(-width / 2, -height / 2);
  context.fillStyle = "#000";
  context.font = "36px sans-serif";
  lines.forEach((line, index) => context.fillText(line, 40, 80 + index * 56));
  return canvas.convertToBlob({ type });
}

/** Puts an EXIF orientation tag right after the JPEG's start marker, the way a phone stores a photo sideways. */
async function with_orientation(jpeg: Blob, orientation: number): Promise<Blob> {
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  const tiff = [0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, orientation, 0, 0, 0, 0, 0, 0];
  const payload = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const segment = [0xff, 0xe1, 0, payload.length + 2, ...payload];
  return new Blob([bytes.slice(0, 2), new Uint8Array(segment), bytes.slice(2)], { type: "image/jpeg" });
}

test("reads a printed list with the bundled models, no network beyond this site", async () => {
  const messages: string[] = [];
  const lines = await read_list(await picture(["- 2x mleko", "- kruh", "- 500 g moka"]), null, signal(), { progress: () => {}, message: (line) => messages.push(line) }, []);
  expect(lines.map((line) => line.toLowerCase())).toEqual(["2x mleko", "kruh", "500 g moka"]);
  expect(messages).toContain("Reading the photo");
}, 60_000);

test("straightens a photo by its orientation tag", async () => {
  const messages: string[] = [];
  const stored = await with_orientation(await picture(["jajca", "maslo", "sadje"], 270, "image/jpeg"), 6);
  const lines = await read_list(stored, null, signal(), { progress: () => {}, message: (line) => messages.push(line) }, []);
  expect(lines).toEqual(["jajca", "maslo", "sadje"]);
  expect(messages.some((line) => line.startsWith("Trying it turned"))).toBe(false);
}, 60_000);

test("turns a poor read until it reads, and keeps that one", async () => {
  const messages: string[] = [];
  const upside_down = await picture(["jajca", "maslo", "sadje"], 180);
  const lines = await read_list(upside_down, null, signal(), { progress: () => {}, message: (line) => messages.push(line) }, []);
  expect(lines).toEqual(["jajca", "maslo", "sadje"]);
  expect(messages.some((line) => line.startsWith("Trying it turned"))).toBe(true);
}, 120_000);

test("snaps words to the history first, then to known spellings, and reads only the framed part", async () => {
  const image = await picture(["RIZ", "ZELENJAVVA", "KANALETO", "SEZAM"]);
  const top = { x: 0, y: 0, width: 640, height: 160 };
  expect(await read_list(image, null, signal(), quiet, ["kanaleta"])).toEqual(["riž", "zelenjava", "kanaleta", "sezam"]);
  expect(await read_list(image, top, signal(), quiet, [])).toEqual(["riž", "zelenjava"]);
}, 120_000);

test("stops when cancelled, before or while reading", async () => {
  const before = new AbortController();
  before.abort();
  await expect(read_list(await picture(["kruh"]), null, before.signal, quiet, [])).rejects.toThrow();
  const during = new AbortController();
  const reading = read_list(await picture(["kruh", "mleko"]), null, during.signal, { progress: () => {}, message: () => during.abort() }, []);
  await expect(reading).rejects.toThrow();
});
