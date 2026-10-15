import { describe, expect, it } from "vitest";
import { decode_rle, encode_rle } from "./rle";

describe("rle", () => {
  it("encodes runs of equal indices", () => {
    expect(encode_rle([0, 0, 0, 3, 3, 1])).toEqual([
      [3, 0],
      [2, 3],
      [1, 1],
    ]);
    expect(encode_rle([])).toEqual([]);
  });

  it("round-trips", () => {
    const data = Uint8Array.from({ length: 300 }, (_, i) => (i * 7) % 5 === 0 ? 2 : i % 3);
    expect(decode_rle(encode_rle(data), data.length)).toEqual(data);
  });

  it("rejects runs that don't add up to the cel", () => {
    expect(() => decode_rle([[3, 1]], 4)).toThrow(/shorter/);
    expect(() => decode_rle([[5, 1]], 4)).toThrow(/longer/);
  });
});
