import { describe, expect, it } from "vitest";
import { color_table_bits, gif_delays, gif_header, scale_indices } from "./gif";

describe("gif", () => {
  it("sizes the colour table to a power of two", () => {
    expect([2, 3, 4, 5, 16, 17, 256].map(color_table_bits)).toEqual([1, 2, 2, 3, 4, 5, 8]);
  });

  it("rounds delays on a running total and never below 2 cs", () => {
    expect(gif_delays([100, 100, 100])).toEqual([10, 10, 10]);
    expect(gif_delays([33, 33, 34])).toEqual([3, 4, 3]);
    expect(gif_delays([0, 5, 100])).toEqual([2, 2, 7]);
  });

  it("scales indices by whole pixels", () => {
    expect([...scale_indices(new Uint8Array([1, 2, 3, 4]), 2, 2, 2)]).toEqual([1, 1, 2, 2, 1, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 4]);
  });

  it("writes the header, palette and loop block", () => {
    const bytes = gif_header({ width: 3, height: 2, palette: ["#00000000", "#ff0000", "#00ff00"], transparent: 0, loop: true });
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe("GIF89a");
    expect([...bytes.slice(6, 13)]).toEqual([3, 0, 2, 0, 0x80 | 0x11, 0, 0]);
    expect([...bytes.slice(13, 25)]).toEqual([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 0]);
    expect(new TextDecoder().decode(bytes.slice(28, 39))).toBe("NETSCAPE2.0");
  });
});
