import { create_barcode_detector, detect_barcode } from "$kit/utils/qr";
import { expect, test } from "vitest";
import { CardFormat, DETECTOR_FORMATS, FORMATS } from "./formats";
import { barcode_path } from "./render";

const SAMPLES: [CardFormat, string][] = [
  [CardFormat.EAN_13, "4006381333931"],
  [CardFormat.EAN_8, "96385074"],
  [CardFormat.UPC_E, "04252614"],
  [CardFormat.CODE_128, "Club-42"],
  [CardFormat.CODE_39, "CARD-39"],
  [CardFormat.CODE_93, "CARD93"],
  [CardFormat.ITF, "12345678"],
  [CardFormat.CODABAR, "A40156B"],
  [CardFormat.QR, "https://example.com/card/1"],
  [CardFormat.PDF417, "PDF417 card"],
  [CardFormat.AZTEC, "Aztec card"],
  [CardFormat.DATA_MATRIX, "DM 0042"],
];

const QUIET = 24;

async function draw(format: CardFormat, code: string): Promise<ImageBitmap> {
  const { width, height, d } = barcode_path(format, code);
  const canvas = new OffscreenCanvas(width * 2 + QUIET * 2, height * 2 + QUIET * 2);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(QUIET, QUIET);
  context.scale(2, 2);
  context.fillStyle = "#000";
  context.fill(new Path2D(d));
  return createImageBitmap(canvas);
}

const supported = await (globalThis as { BarcodeDetector?: { getSupportedFormats(): Promise<string[]> } }).BarcodeDetector?.getSupportedFormats().catch(() => []) ?? [];

test.each(SAMPLES.filter(([format]) => supported.includes(format)))("%s reads back as drawn", async (format, code) => {
  const detector = await create_barcode_detector(DETECTOR_FORMATS);
  const read = await detect_barcode(detector, await draw(format, code));
  expect(read, FORMATS[format].label).toEqual({ value: code, format });
});
