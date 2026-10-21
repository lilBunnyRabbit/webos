import { expect, test } from "vitest";
import { create_qr_detector, detect_qr } from "../qr";
import { encode_light, equal_bytes, LightDecoder, LightResult } from "./codec";
import { prng } from "./lt";
import { frame_bitmap, frame_modules } from "./render";

const INK = { dark: [20, 20, 20], light: [240, 240, 240] } as const satisfies {
  dark: [number, number, number];
  light: [number, number, number];
};
const SCALE = 4;

test.each([15, 20])(
  "frames drawn at version %i read back through the barcode detector into the same file",
  async (version) => {
    const random = prng(version);
    const bytes = new Uint8Array(12_000);
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(random() * 256);
    const stream = await encode_light({ name: "photo.jpg", type: "image/jpeg", bytes }, version);
    const detector = await create_qr_detector();
    const side = frame_modules(version) * SCALE;
    const canvas = new OffscreenCanvas(side, side);
    const context = canvas.getContext("2d")!;
    context.imageSmoothingEnabled = false;

    const decoder = new LightDecoder();
    let render_ms = 0;
    let detect_ms = 0;
    let detected = 0;
    let result: string = LightResult.ADDED;
    for (let position = 0; result !== LightResult.COMPLETE && position < stream.header.k * 4; position++) {
      if (random() < 0.2) continue;
      const started = performance.now();
      const bitmap = await frame_bitmap(stream.frame(position), version, INK);
      context.drawImage(bitmap, 0, 0, side, side);
      bitmap.close();
      const drawn = await createImageBitmap(canvas);
      const read_at = performance.now();
      render_ms += read_at - started;
      const text = await detect_qr(detector, drawn);
      detect_ms += performance.now() - read_at;
      drawn.close();
      expect(text).not.toBeNull();
      detected++;
      result = decoder.add(text!);
    }

    expect(result).toBe(LightResult.COMPLETE);
    const file = await decoder.result();
    expect(file.name).toBe("photo.jpg");
    expect(equal_bytes(file.bytes, bytes)).toBe(true);
    console.info(
      `[light] ${"BarcodeDetector" in globalThis ? "native" : "jsQR"} v${version}: k=${stream.header.k}, ${detected} frames read, render ${(render_ms / detected).toFixed(1)} ms/frame, ` +
        `detect ${(detect_ms / detected).toFixed(1)} ms/frame (${(1000 / (detect_ms / detected)).toFixed(0)} frames/s)`
    );
  }
);
