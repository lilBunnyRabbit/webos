import { describe, expect, it } from "vitest";
import { ENCODERS, EncoderFormat } from "./encoders";

function sample(width: number, height: number, alpha: boolean): ImageData {
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      image.data.set([x < width / 2 ? 230 : 20, y < height / 2 ? 40 : 200, 90, alpha && x < 4 ? 0 : 255], at);
    }
  return image;
}

async function pixels(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none" });
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d")!;
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

const at = (image: ImageData, x: number, y: number) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

describe("encoder table", () => {
  it("every format writes a file of its own type", async () => {
    const image = sample(24, 16, false);
    for (const format of [EncoderFormat.GIF, EncoderFormat.BMP, EncoderFormat.ICO, EncoderFormat.TIFF, EncoderFormat.QOI, EncoderFormat.TGA, EncoderFormat.PPM, EncoderFormat.PNG, EncoderFormat.JPEG, EncoderFormat.WEBP]) {
      const blob = await ENCODERS[format].encode(image, { quality: 80 });
      expect(blob.type, format).toBe(ENCODERS[format].mime);
      expect(blob.size, format).toBeGreaterThan(0);
    }
  });

  it("the browser reads back BMP, GIF and ICO with their transparency", async () => {
    const image = sample(24, 16, true);
    for (const format of [EncoderFormat.BMP, EncoderFormat.GIF]) {
      const decoded = await pixels(await ENCODERS[format].encode(image));
      expect([decoded.width, decoded.height], format).toEqual([24, 16]);
      expect(at(decoded, 1, 1)[3], format).toBe(0);
      expect(at(decoded, 10, 1), format).toEqual([230, 40, 90, 255]);
      expect(at(decoded, 20, 12), format).toEqual([20, 200, 90, 255]);
    }
    const icon = await pixels(await ENCODERS.ico.encode(image));
    expect([icon.width, icon.height]).toEqual([24, 24]);
    expect(at(icon, 0, 0)[3]).toBe(0);
  });

  it("a 24-bit BMP is byte-exact", async () => {
    const image = sample(13, 7, false);
    const decoded = await pixels(await ENCODERS.bmp.encode(image));
    expect([...decoded.data]).toEqual([...image.data]);
  });

  it("quality changes the size of a lossy format", async () => {
    const image = new ImageData(64, 64);
    for (let i = 0; i < image.data.length; i++) image.data[i] = (i * 2654435761) >>> 24;
    const low = await ENCODERS.jpeg.encode(image, { quality: 20 });
    const high = await ENCODERS.jpeg.encode(image, { quality: 95 });
    expect(high.size).toBeGreaterThan(low.size);
  });

  it("aborting rejects", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(ENCODERS.png.encode(sample(8, 8, false), { signal: controller.signal })).rejects.toBeDefined();
  });
});
