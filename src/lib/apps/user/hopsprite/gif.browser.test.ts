import { describe, expect, it } from "vitest";
import { encode_gif, type GifHeader } from "./gif";

async function decode(blob: Blob) {
  const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: "image/gif" });
  await decoder.tracks.ready;
  const count = decoder.tracks.selectedTrack!.frameCount;
  const frames: { rgba: Uint8ClampedArray; duration: number }[] = [];
  for (let i = 0; i < count; i++) {
    const { image } = await decoder.decode({ frameIndex: i });
    const canvas = new OffscreenCanvas(image.displayWidth, image.displayHeight);
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    frames.push({ rgba: context.getImageData(0, 0, canvas.width, canvas.height).data, duration: (image.duration ?? 0) / 1000 });
    image.close();
  }
  decoder.close();
  return frames;
}

describe("gif in the browser", () => {
  it("round-trips frames, transparency and delays", async () => {
    const header: GifHeader = { width: 3, height: 1, palette: ["#00000000", "#ff0000", "#0000ff"], transparent: 0, loop: true };
    const frames = await decode(
      encode_gif(header, [
        { indices: new Uint8Array([1, 0, 2]), delay: 10 },
        { indices: new Uint8Array([0, 2, 0]), delay: 25 },
      ])
    );
    expect(frames).toHaveLength(2);
    expect([...frames[0].rgba]).toEqual([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255]);
    expect([...frames[1].rgba]).toEqual([0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 0, 0]);
    expect(frames.map((frame) => frame.duration)).toEqual([100, 250]);
  });

  it("survives code table resets on noisy 256-colour data", async () => {
    const width = 300;
    const height = 200;
    const palette = Array.from({ length: 256 }, (_, i) => `#${i.toString(16).padStart(2, "0")}${(255 - i).toString(16).padStart(2, "0")}80`);
    let seed = 7;
    const indices = new Uint8Array(width * height).map(() => (seed = (seed * 1103515245 + 12345) >>> 0) >>> 24);
    const [frame] = await decode(encode_gif({ width, height, palette, transparent: null, loop: false }, [{ indices, delay: 10 }]));
    for (const i of [0, 1, 4095, 4096, 30000, indices.length - 1]) {
      expect([frame.rgba[i * 4], frame.rgba[i * 4 + 1], frame.rgba[i * 4 + 3]]).toEqual([indices[i], 255 - indices[i], 255]);
    }
    let wrong = 0;
    for (let i = 0; i < indices.length; i++) if (frame.rgba[i * 4] !== indices[i]) wrong++;
    expect(wrong).toBe(0);
  });

  it("encodes long runs of one colour", async () => {
    const indices = new Uint8Array(512 * 512).fill(1);
    indices[512 * 300 + 7] = 2;
    const [frame] = await decode(encode_gif({ width: 512, height: 512, palette: ["#00000000", "#123456", "#abcdef"], transparent: 0, loop: false }, [{ indices, delay: 10 }]));
    expect([...frame.rgba.slice(0, 4)]).toEqual([0x12, 0x34, 0x56, 255]);
    expect([...frame.rgba.slice((512 * 300 + 7) * 4, (512 * 300 + 8) * 4)]).toEqual([0xab, 0xcd, 0xef, 255]);
  });
});
