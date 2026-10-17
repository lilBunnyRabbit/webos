import { describe, expect, it } from "vitest";
import { dump_blob, dump_rows, Endian, format_row, inspect, offset_digits, parse_offset, row_count } from "./hex";

const bytes = (...values: number[]) => new Uint8Array(values);
const text = (source: string) => new TextEncoder().encode(source);

describe("format_row", () => {
  it("matches xxd: offset, byte pairs, two spaces, ASCII with dots", () => {
    expect(format_row(text("Hello, world!\n\0\x7f"), 0x10)).toBe("00000010: 4865 6c6c 6f2c 2077 6f72 6c64 210a 007f  Hello, world!...");
  });

  it("pads a short last row so the ASCII column lines up", () => {
    expect(format_row(bytes(0x41, 0x42, 0x43), 0x20)).toBe(`00000020: ${"4142 43".padEnd(39)}  ABC`);
    expect(format_row(bytes(0x41, 0x42, 0x43), 0).indexOf("ABC")).toBe(format_row(text("ABCDEFGHIJKLMNOP"), 0).indexOf("ABC"));
  });
});

describe("offset_digits and row_count", () => {
  it("uses 8 digits up to 4 GiB and more past it", () => {
    expect(offset_digits(0)).toBe(8);
    expect(offset_digits(2 ** 32)).toBe(8);
    expect(offset_digits(2 ** 32 + 1)).toBe(9);
  });

  it("counts a partial last row", () => {
    expect(row_count(0)).toBe(0);
    expect(row_count(16)).toBe(1);
    expect(row_count(17)).toBe(2);
  });
});

describe("parse_offset", () => {
  it("reads 0x, h suffix and hex letters as hex, plain digits as decimal", () => {
    expect(parse_offset("0x1F")).toBe(31);
    expect(parse_offset("1fh")).toBe(31);
    expect(parse_offset("ff")).toBe(255);
    expect(parse_offset("100")).toBe(100);
    expect(parse_offset(" 1_000 ")).toBe(1000);
  });

  it("rejects anything else", () => {
    expect(parse_offset("")).toBeNull();
    expect(parse_offset("-4")).toBeNull();
    expect(parse_offset("0xzz")).toBeNull();
    expect(parse_offset("1.5")).toBeNull();
  });
});

describe("inspect", () => {
  const value = (bytes: Uint8Array, endian: Endian, label: string) => inspect(bytes, endian).find((item) => item.label === label)?.value;

  it("reads the cursor's bytes in either byte order", () => {
    const sample = bytes(0x01, 0x02, 0x03, 0x04);
    expect(value(sample, Endian.LITTLE, "u16")).toBe("513");
    expect(value(sample, Endian.BIG, "u16")).toBe("258");
    expect(value(sample, Endian.LITTLE, "u32")).toBe(String(0x04030201));
    expect(value(bytes(0xff, 0xff), Endian.LITTLE, "i16")).toBe("-1");
    expect(value(bytes(0x00, 0x00, 0x80, 0x3f), Endian.LITTLE, "f32")).toBe("1");
    expect(value(bytes(0x05), Endian.LITTLE, "bin")).toBe("00000101");
  });

  it("shows a dash for types longer than what's left of the file", () => {
    expect(value(bytes(0x01, 0x02), Endian.LITTLE, "u32")).toBe("—");
    expect(value(bytes(), Endian.LITTLE, "u8")).toBe("—");
  });
});

describe("hexdump rows", () => {
  it("splits into 16-byte rows starting at the given offset", () => {
    const rows = dump_rows(text("abcdefghijklmnopqr"), 0x40);
    expect(rows).toEqual([
      { offset: 0x40, hex: "6162 6364 6566 6768 696a 6b6c 6d6e 6f70", ascii: "abcdefghijklmnop" },
      { offset: 0x50, hex: "7172".padEnd(39), ascii: "qr" },
    ]);
  });

  it("dumps only the requested slice of a blob, as clickable rows", async () => {
    const blob = new Blob([new Uint8Array(100).map((_, index) => index)]);
    const rows = [];
    for await (const row of dump_blob(blob, "/home/a.bin", 90, 64)) rows.push(row);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ $type: "hex-row", offset: 90, path: "/home/a.bin", hex: "5a5b 5c5d 5e5f 6061 6263".padEnd(39) });
  });

  it("yields nothing past the end", async () => {
    const rows = [];
    for await (const row of dump_blob(new Blob(["abc"]), "/a", 10, 16)) rows.push(row);
    expect(rows).toEqual([]);
  });
});
