import { describe, expect, it } from "vitest";
import { gif_delays, gif_local_frame, gif_start, GIF_TRAILER } from "./gif";
import { map_pixels, median_cut } from "$kit/utils/codecs/quantize";

describe("gif with local palettes in the browser", () => {
  it("decodes frames with different palettes and their delays", async () => {
    const red = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255]);
    const green = new Uint8Array([0, 255, 0, 255, 255, 255, 255, 255]);
    const delays = gif_delays([100, 250]);
    const frames = [red, green].map((rgba, i) => {
      const palette = median_cut(rgba, 256);
      return gif_local_frame({
        width: 2,
        height: 1,
        palette,
        indices: map_pixels(rgba, 2, 1, palette, false),
        delay: delays[i],
      });
    });
    const blob = new Blob([gif_start(2, 1), ...frames, GIF_TRAILER], { type: "image/gif" });
    const decoder = new ImageDecoder({ data: await blob.arrayBuffer(), type: "image/gif" });
    await decoder.tracks.ready;
    expect(decoder.tracks.selectedTrack!.frameCount).toBe(2);
    const pixels: number[][] = [];
    const durations: number[] = [];
    for (let i = 0; i < 2; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      const context = new OffscreenCanvas(2, 1).getContext("2d")!;
      context.drawImage(image, 0, 0);
      pixels.push([...context.getImageData(0, 0, 2, 1).data]);
      durations.push((image.duration ?? 0) / 1000);
      image.close();
    }
    decoder.close();
    expect(pixels).toEqual([[...red], [...green]]);
    expect(durations).toEqual([100, 250]);
  });
});
