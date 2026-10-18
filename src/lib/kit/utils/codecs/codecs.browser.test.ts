import { describe, expect, it } from "vitest";
import { CODECS, CodecFormat, compare, decode, encode, is_avif, is_jxl, supported } from ".";

function sample(width = 96, height = 64): ImageData {
  const image = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      image.data[offset] = (x * 255) / width;
      image.data[offset + 1] = (y * 255) / height;
      image.data[offset + 2] = (x + y) % 32 < 16 ? 40 : 220;
      image.data[offset + 3] = 255;
    }
  }
  return image;
}

async function head(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(0, 16).arrayBuffer());
}

describe("codecs", () => {
  it.each([CodecFormat.JPEG, CodecFormat.WEBP, CodecFormat.AVIF, CodecFormat.JXL, CodecFormat.PNG])(
    "round-trips %s",
    async (format) => {
      const image = sample();
      expect(await supported(format)).toBe(true);
      const { blob, ms } = await encode(format, image, { quality: 90 });
      expect(blob.type).toBe(CODECS[format].mime);
      expect(blob.size).toBeGreaterThan(0);
      expect(ms).toBeGreaterThanOrEqual(0);
      if (format === CodecFormat.JXL) expect(is_jxl(await head(blob))).toBe(true);
      if (format === CodecFormat.AVIF) expect(is_avif(await head(blob))).toBe(true);

      const decoded = await decode(blob);
      expect([decoded.width, decoded.height]).toEqual([image.width, image.height]);
      const { score } = await compare(image, decoded);
      expect(score).toBeGreaterThan(0.9);
    },
    60_000
  );

  it.each([CodecFormat.WEBP, CodecFormat.AVIF, CodecFormat.JXL, CodecFormat.PNG])(
    "keeps every pixel of %s when lossless",
    async (format) => {
      const image = sample(40, 24);
      const decoded = await decode((await encode(format, image, { lossless: true })).blob);
      const drift = Math.max(...decoded.data.map((value, index) => Math.abs(value - image.data[index])));
      // jSquash's JPEG XL decoder goes through float and rounds a few values one step off.
      expect(drift).toBeLessThanOrEqual(format === CodecFormat.JXL ? 1 : 0);
    },
    60_000
  );

  it("decodes a JPEG XL by its signature, whatever the type says", async () => {
    const { blob } = await encode(CodecFormat.JXL, sample());
    const untyped = new Blob([blob]);
    expect((await decode(untyped)).width).toBe(96);
  }, 60_000);

  it("stops an encode when the signal aborts", async () => {
    const controller = new AbortController();
    const pending = encode(CodecFormat.AVIF, sample(512, 512), { effort: 0 }, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toThrow();
    const { blob } = await encode(CodecFormat.WEBP, sample());
    expect(blob.size).toBeGreaterThan(0);
  }, 60_000);

  it("rejects what isn't an image", async () => {
    await expect(decode(new Blob(["hello"], { type: "text/plain" }))).rejects.toThrow("Not an image");
  });
});
