import { describe, expect, test } from "vitest";
import { encode_gif_image } from "./gif";
import { ico_sizes } from "./ico";
import { encode_ppm } from "./ppm";
import { encode_qoi, qoi_hash } from "./qoi";
import { encode_tga } from "./tga";
import { encode_tiff } from "./tiff";
import type { Pixels } from "./ssim";

function sample(width: number, height: number, alpha: boolean): Pixels {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 4;
      const flat = x < width / 2 && y < 2;
      data.set([flat ? 40 : (x * 37 + y) & 255, flat ? 80 : (y * 11) & 255, flat ? 120 : (x ^ y) * 9 & 255, alpha ? (x * 50) & 255 : 255], at);
    }
  return { width, height, data };
}

function decode_qoi(bytes: Uint8Array): Pixels & { channels: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  expect(String.fromCharCode(...bytes.subarray(0, 4))).toBe("qoif");
  const width = view.getUint32(4);
  const height = view.getUint32(8);
  const channels = bytes[12];
  const data = new Uint8Array(width * height * 4);
  const seen = new Uint8Array(256);
  let [r, g, b, a] = [0, 0, 0, 255];
  let at = 14;
  let run = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (run > 0) run--;
    else {
      const op = bytes[at++];
      if (op === 0xfe) [r, g, b] = [bytes[at++], bytes[at++], bytes[at++]];
      else if (op === 0xff) [r, g, b, a] = [bytes[at++], bytes[at++], bytes[at++], bytes[at++]];
      else if (op >> 6 === 0) [r, g, b, a] = seen.subarray(op * 4, op * 4 + 4);
      else if (op >> 6 === 1) {
        r = (r + ((op >> 4) & 3) - 2) & 255;
        g = (g + ((op >> 2) & 3) - 2) & 255;
        b = (b + (op & 3) - 2) & 255;
      } else if (op >> 6 === 2) {
        const next = bytes[at++];
        const dg = (op & 63) - 32;
        r = (r + dg + ((next >> 4) & 15) - 8) & 255;
        g = (g + dg) & 255;
        b = (b + dg + (next & 15) - 8) & 255;
      } else run = op & 63;
      seen.set([r, g, b, a], qoi_hash(r, g, b, a) * 4);
    }
    data.set([r, g, b, a], i);
  }
  expect([...bytes.subarray(at)]).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  return { width, height, data, channels };
}

describe("QOI", () => {
  test("round-trips opaque and transparent images through a reference decoder", () => {
    for (const alpha of [false, true]) {
      const image = sample(37, 9, alpha);
      const decoded = decode_qoi(encode_qoi(image));
      expect(decoded).toMatchObject({ width: 37, height: 9, channels: alpha ? 4 : 3 });
      expect(decoded.data).toEqual(image.data);
    }
  });

  test("runs longer than 62 pixels split", () => {
    const image = { width: 200, height: 1, data: new Uint8Array(800).fill(255) };
    const bytes = encode_qoi(image);
    expect(decode_qoi(bytes).data).toEqual(image.data);
    expect(bytes.length).toBe(14 + 1 + 4 + 8);
  });
});

describe("TGA", () => {
  test("writes uncompressed true colour, top-left origin, BGR", () => {
    const image = sample(3, 2, false);
    const bytes = encode_tga(image);
    const view = new DataView(bytes.buffer);
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0, 0, 2]);
    expect([view.getUint16(12, true), view.getUint16(14, true), bytes[16], bytes[17]]).toEqual([3, 2, 24, 0x20]);
    expect([...bytes.subarray(18, 21)]).toEqual([image.data[2], image.data[1], image.data[0]]);
    expect(bytes.length).toBe(18 + 3 * 2 * 3 + 26);
    expect(new TextDecoder().decode(bytes.subarray(bytes.length - 18, bytes.length - 1))).toBe("TRUEVISION-XFILE.");
  });

  test("keeps alpha as a fourth byte with 8 attribute bits", () => {
    const image = sample(2, 2, true);
    const bytes = encode_tga(image);
    expect([bytes[16], bytes[17]]).toEqual([32, 0x28]);
    expect([...bytes.subarray(18 + 4, 18 + 8)]).toEqual([image.data[6], image.data[5], image.data[4], image.data[7]]);
  });

  test("refuses sides over 65535", () => {
    expect(() => encode_tga({ width: 70_000, height: 1, data: new Uint8Array(280_000) })).toThrow();
  });
});

describe("PPM", () => {
  test("binary P6 with transparency flattened onto white", () => {
    const bytes = encode_ppm({ width: 2, height: 1, data: new Uint8Array([10, 20, 30, 255, 0, 0, 0, 0]) });
    const header = "P6\n2 1\n255\n";
    expect(new TextDecoder().decode(bytes.subarray(0, header.length))).toBe(header);
    expect([...bytes.subarray(header.length)]).toEqual([10, 20, 30, 255, 255, 255]);
  });
});

describe("TIFF", () => {
  function read_tiff(bytes: Uint8Array) {
    const view = new DataView(bytes.buffer);
    expect([bytes[0], bytes[1], view.getUint16(2, true)]).toEqual([0x49, 0x49, 42]);
    const ifd = view.getUint32(4, true);
    const tags = new Map<number, number>();
    const count = view.getUint16(ifd, true);
    let previous = 0;
    for (let i = 0; i < count; i++) {
      const at = ifd + 2 + i * 12;
      const tag = view.getUint16(at, true);
      expect(tag).toBeGreaterThan(previous);
      previous = tag;
      const type = view.getUint16(at + 2, true);
      const values = view.getUint32(at + 4, true);
      tags.set(tag, type === 3 && values === 1 ? view.getUint16(at + 8, true) : view.getUint32(at + 8, true));
    }
    expect(view.getUint32(ifd + 2 + count * 12, true)).toBe(0);
    return tags;
  }

  test("an opaque image is one uncompressed RGB strip", () => {
    const image = sample(5, 3, false);
    const bytes = encode_tiff(image);
    const tags = read_tiff(bytes);
    expect([tags.get(256), tags.get(257), tags.get(259), tags.get(262), tags.get(277), tags.get(278)]).toEqual([5, 3, 1, 2, 3, 3]);
    expect(tags.has(338)).toBe(false);
    const start = tags.get(273)!;
    expect(tags.get(279)).toBe(5 * 3 * 3);
    expect(start + tags.get(279)!).toBe(bytes.length);
    expect([...bytes.subarray(start, start + 6)]).toEqual([...image.data.subarray(0, 3), ...image.data.subarray(4, 7)]);
    const bits = tags.get(258)!;
    expect([0, 1, 2].map((i) => new DataView(bytes.buffer).getUint16(bits + i * 2, true))).toEqual([8, 8, 8]);
  });

  test("transparency adds an unassociated alpha sample", () => {
    const image = sample(4, 2, true);
    const bytes = encode_tiff(image);
    const tags = read_tiff(bytes);
    expect([tags.get(277), tags.get(338)]).toEqual([4, 2]);
    expect([...bytes.subarray(tags.get(273)!)]).toEqual([...image.data]);
  });
});

describe("GIF still", () => {
  test("few colours stay exact, and holes get the transparent entry", () => {
    const data = new Uint8Array([255, 0, 0, 255, 0, 0, 255, 255, 9, 9, 9, 0, 255, 0, 0, 255]);
    const bytes = encode_gif_image({ width: 2, height: 2, data });
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe("GIF89a");
    expect(bytes[10] & 0x80).toBe(0x80);
    const table = bytes.subarray(13, 13 + 3 * 4);
    const colours = [0, 1, 2].map((i) => [...table.subarray(i * 3, i * 3 + 3)].join(","));
    expect(colours).toContain("255,0,0");
    expect(colours).toContain("0,0,255");
    expect(bytes.at(-1)).toBe(0x3b);
  });
});

describe("ICO sizes", () => {
  test("the usual sizes up to the image's own, 256 at most", () => {
    expect(ico_sizes(4000)).toEqual([16, 32, 48, 256]);
    expect(ico_sizes(100)).toEqual([16, 32, 48, 100]);
    expect(ico_sizes(32)).toEqual([16, 32]);
    expect(ico_sizes(10)).toEqual([10]);
  });
});
