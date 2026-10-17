import { describe, expect, it } from "vitest";
import { CHARACTER_GROUPS, code_label, detect_format, FontFormat, read_font, variation_settings } from "./font";

class Writer {
  private bytes: number[] = [];
  u16(value: number) {
    this.bytes.push((value >> 8) & 0xff, value & 0xff);
    return this;
  }
  u32(value: number) {
    return this.u16((value >>> 16) & 0xffff).u16(value & 0xffff);
  }
  fixed(value: number) {
    return this.u32(Math.round(value * 65536) >>> 0);
  }
  tag(value: string) {
    for (const char of value) this.bytes.push(char.charCodeAt(0));
    return this;
  }
  raw(values: Uint8Array) {
    this.bytes.push(...values);
    return this;
  }
  done() {
    return new Uint8Array(this.bytes);
  }
}

const utf16 = (text: string) => {
  const writer = new Writer();
  for (const char of text) writer.u16(char.charCodeAt(0));
  return writer.done();
};

function name_table(names: Record<number, string>) {
  const entries = Object.entries(names).map(([id, text]) => [Number(id), utf16(text)] as const);
  const writer = new Writer().u16(0).u16(entries.length).u16(6 + entries.length * 12);
  let offset = 0;
  for (const [id, bytes] of entries) {
    writer.u16(3).u16(1).u16(0x409).u16(id).u16(bytes.length).u16(offset);
    offset += bytes.length;
  }
  for (const [, bytes] of entries) writer.raw(bytes);
  return writer.done();
}

function cmap_table() {
  // Format 4: 'A'..'C' via delta, then the 0xFFFF terminator segment.
  const sub = new Writer().u16(4).u16(32).u16(0).u16(4).u16(4).u16(1).u16(0);
  sub.u16(0x43).u16(0xffff).u16(0).u16(0x41).u16(0xffff).u16(1 - 0x41).u16(1).u16(0).u16(0);
  return new Writer().u16(0).u16(1).u16(3).u16(1).u32(12).raw(sub.done()).done();
}

function fvar_table() {
  return new Writer()
    .u16(1).u16(0).u16(16).u16(2).u16(1).u16(20).u16(1).u16(8)
    .tag("wght").fixed(100).fixed(400).fixed(900).u16(0).u16(256)
    .u16(257).u16(0).fixed(700)
    .done();
}

function sfnt(tables: Record<string, Uint8Array>) {
  const entries = Object.entries(tables);
  const writer = new Writer().u32(0x00010000).u16(entries.length).u16(0).u16(0).u16(0);
  let offset = 12 + entries.length * 16;
  for (const [tag, data] of entries) {
    writer.tag(tag).u32(0).u32(offset).u32(data.length);
    offset += data.length;
  }
  for (const [, data] of entries) writer.raw(data);
  return writer.done();
}

async function deflate(data: Uint8Array<ArrayBuffer>) {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function woff(tables: Record<string, Uint8Array<ArrayBuffer>>) {
  const entries = await Promise.all(Object.entries(tables).map(async ([tag, data]) => [tag, data, await deflate(data).then((packed) => (packed.length < data.length ? packed : data))] as const));
  const writer = new Writer().tag("wOFF").u32(0x00010000).u32(0).u16(entries.length).u16(0);
  for (let index = 0; index < 7; index++) writer.u32(0);
  let offset = 44 + entries.length * 20;
  for (const [tag, data, packed] of entries) {
    writer.tag(tag).u32(offset).u32(packed.length).u32(data.length).u32(0);
    offset += packed.length;
  }
  for (const [, , packed] of entries) writer.raw(packed);
  return writer.done();
}

const TABLES = {
  name: name_table({ 1: "Bunny Sans", 2: "Regular", 4: "Bunny Sans Regular", 5: "Version 1.002", 256: "Weight", 257: "Bold" }),
  cmap: cmap_table(),
  maxp: new Writer().u32(0x5000).u16(4).done(),
  "OS/2": new Writer().u16(4).u16(500).u16(400).done(),
  fvar: fvar_table(),
};

describe("detect_format", () => {
  it("knows the format by its first four bytes", () => {
    const tag = (text: string) => new TextEncoder().encode(text);
    expect(detect_format(new Uint8Array([0, 1, 0, 0]))).toBe(FontFormat.TRUETYPE);
    expect(detect_format(tag("OTTO"))).toBe(FontFormat.OPENTYPE);
    expect(detect_format(tag("wOFF"))).toBe(FontFormat.WOFF);
    expect(detect_format(tag("wOF2"))).toBe(FontFormat.WOFF2);
    expect(detect_format(tag("ttcf"))).toBe(FontFormat.COLLECTION);
    expect(detect_format(tag("%PDF"))).toBe(FontFormat.UNKNOWN);
    expect(detect_format(new Uint8Array(2))).toBe(FontFormat.UNKNOWN);
  });
});

describe("read_font", () => {
  it("reads names, glyph count, weight, coverage and variable axes from an sfnt", async () => {
    const info = await read_font(sfnt(TABLES).buffer);
    expect(info).toMatchObject({
      format: FontFormat.TRUETYPE,
      family: "Bunny Sans",
      style: "Regular",
      full_name: "Bunny Sans Regular",
      version: "Version 1.002",
      glyphs: 4,
      weight: 400,
      axes: [{ tag: "wght", name: "Weight", min: 100, default: 400, max: 900 }],
      instances: [{ name: "Bold", coordinates: { wght: 700 } }],
    });
    expect([...(info.codepoints ?? [])]).toEqual([0x41, 0x42, 0x43]);
  });

  it("inflates WOFF tables", async () => {
    const info = await read_font((await woff(TABLES)).buffer);
    expect(info.format).toBe(FontFormat.WOFF);
    expect(info.family).toBe("Bunny Sans");
    expect(info.axes).toHaveLength(1);
  });

  it("knows only the format of WOFF2 and unknown files", async () => {
    const info = await read_font(new TextEncoder().encode("wOF2....").buffer);
    expect(info).toMatchObject({ format: FontFormat.WOFF2, family: null, axes: [], codepoints: null });
  });
});

describe("helpers", () => {
  it("formats variation settings and code points", () => {
    expect(variation_settings({ wght: 650, wdth: 90 })).toBe('"wght" 650, "wdth" 90');
    expect(variation_settings({})).toBe("normal");
    expect(code_label(0x41)).toBe("U+0041");
    expect(code_label(0x20ac)).toBe("U+20AC");
  });

  it("covers Basic Latin, Latin-1 and common punctuation", () => {
    const all = new Set(CHARACTER_GROUPS.flatMap((group) => group.codepoints));
    for (let code = 0x21; code <= 0x7e; code++) expect(all.has(code)).toBe(true);
    expect(all.has(0xe9)).toBe(true);
    expect(all.has(0x2014)).toBe(true);
    expect(all.size).toBe(new Set([...all]).size);
  });
});
