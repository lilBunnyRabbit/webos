import { describe, expect, it } from "vitest";
import { gif_local_frame, gif_start } from "./gif";

describe("gif with local palettes", () => {
  it("writes a header with no global table and a loop block", () => {
    const bytes = gif_start(320, 200);
    expect(new TextDecoder().decode(bytes.slice(0, 6))).toBe("GIF89a");
    expect([...bytes.slice(6, 13)]).toEqual([64, 1, 200, 0, 0, 0, 0]);
    expect(new TextDecoder().decode(bytes.slice(16, 27))).toBe("NETSCAPE2.0");
  });

  it("gives each frame its own colour table, padded to a power of two", () => {
    const frame = gif_local_frame({
      width: 2,
      height: 1,
      palette: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]),
      indices: new Uint8Array([0, 2]),
      delay: 7,
    });
    expect([...frame.slice(0, 8)]).toEqual([0x21, 0xf9, 0x04, 4, 7, 0, 0, 0]);
    expect(frame[8]).toBe(0x2c);
    expect(frame[17]).toBe(0x80 | 1);
    expect([...frame.slice(18, 30)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 0, 0, 0]);
    expect(frame[30]).toBe(2);
  });
});
