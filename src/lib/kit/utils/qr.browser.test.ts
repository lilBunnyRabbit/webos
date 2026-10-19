import { afterEach, expect, test, vi } from "vitest";
import { create_barcode_detector, create_qr_detector, detect_barcode, detect_qr, qr_path, type BarcodeDetector, type QrSource } from "./qr";

const SCALE = 6;

function qr_bitmap(text: string): Promise<ImageBitmap> {
  const { size, d } = qr_path(text);
  const canvas = new OffscreenCanvas(size * SCALE, size * SCALE);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.scale(SCALE, SCALE);
  context.fillStyle = "#000";
  context.fill(new Path2D(d));
  return createImageBitmap(canvas);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a QR detector reads a QR code and reports its format", async () => {
  const bitmap = await qr_bitmap("hello cards");
  const detector = await create_qr_detector();
  expect(await detect_barcode(detector, bitmap)).toEqual({ value: "hello cards", format: "qr_code" });
  expect(await detect_qr(detector, bitmap)).toBe("hello cards");
});

test("detect_barcode answers null when there is nothing to read", async () => {
  const canvas = new OffscreenCanvas(64, 64);
  canvas.getContext("2d")!.fillRect(0, 0, 1, 1);
  expect(await detect_barcode(await create_barcode_detector(["qr_code"]), await createImageBitmap(canvas))).toBeNull();
});

function stub_native(supported: string[]) {
  const created: string[][] = [];
  class StubDetector implements BarcodeDetector {
    constructor(private readonly options: { formats: string[] }) {
      created.push(options.formats);
    }
    static async getSupportedFormats() {
      return supported;
    }
    async detect(_source: QrSource) {
      return [{ rawValue: "4006381333931", format: this.options.formats[0] }];
    }
  }
  vi.stubGlobal("BarcodeDetector", StubDetector);
  return created;
}

test("the native detector reads the asked formats it supports, in the asked order", async () => {
  const created = stub_native(["qr_code", "ean_13", "code_128"]);
  const detector = await create_barcode_detector(["ean_13", "upc_a", "qr_code"]);
  expect(created).toEqual([["ean_13", "qr_code"]]);
  expect(await detect_barcode(detector, await qr_bitmap("x"))).toEqual({ value: "4006381333931", format: "ean_13" });
});

test("when the native detector reads none of the asked formats, jsQR reads QR", async () => {
  const created = stub_native(["ean_13"]);
  const detector = await create_barcode_detector(["qr_code"]);
  expect(created).toEqual([]);
  expect(await detect_barcode(detector, await qr_bitmap("fallback"))).toEqual({ value: "fallback", format: "qr_code" });
});

test("without a native detector, jsQR reads QR", async () => {
  vi.stubGlobal("BarcodeDetector", undefined);
  const detector = await create_barcode_detector(["ean_13", "qr_code"]);
  expect(await detect_barcode(detector, await qr_bitmap("no native"))).toEqual({ value: "no native", format: "qr_code" });
});
