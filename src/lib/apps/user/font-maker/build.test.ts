import { describe, expect, test } from "vitest";
import { read_font, FontFormat } from "../font-viewer/font";
import { build_font, place_glyph } from "./build";
import { CharSet } from "./charsets";
import { add_stroke, create_project, type FontProject, type Stroke } from "./model";
import { checksum } from "./ttf";

const line = (x0: number, y0: number, x1: number, y1: number): Stroke =>
  Array.from({ length: 11 }, (_, index) => [x0 + ((x1 - x0) * index) / 10, y0 + ((y1 - y0) * index) / 10, 0.5]);

function sample(): FontProject {
  let project = create_project("Test Hand");
  project = add_stroke(project, "A", line(100, 0, 300, 700));
  project = add_stroke(project, "A", line(300, 700, 500, 0));
  project = add_stroke(project, "A", line(180, 300, 420, 300));
  project = add_stroke(project, "o", line(200, 0, 200, 480));
  project = add_stroke(project, "€", line(0, 0, 400, 400));
  return { ...project, sets: [CharSet.BASIC_LATIN, CharSet.SYMBOLS] };
}

const buffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

describe("build_font", () => {
  test("Font Viewer's parser reads the family, glyph count and codepoints", async () => {
    const info = await read_font(buffer(build_font(sample())));
    expect(info.format).toBe(FontFormat.TRUETYPE);
    expect(info.family).toBe("Test Hand");
    expect(info.style).toBe("Regular");
    expect(info.glyphs).toBe(5);
    expect(info.weight).toBe(400);
    expect([...(info.codepoints ?? [])].sort((a, b) => a - b)).toEqual([0x20, 0x41, 0x6f, 0xa0, 0x20ac]);
  });

  test("empty glyphs and characters outside the picked sets are left out", async () => {
    const project = { ...sample(), sets: [CharSet.BASIC_LATIN] };
    const info = await read_font(buffer(build_font(project)));
    expect(info.glyphs).toBe(4);
    expect(info.codepoints?.has(0x20ac)).toBe(false);
    expect(info.codepoints?.has(0x42)).toBe(false);
  });

  test("the whole font checksums to the magic number and tables are aligned", () => {
    const bytes = build_font(sample(), new Date("2026-10-20T00:00:00Z"));
    expect(bytes.length % 4).toBe(0);
    expect(checksum(bytes)).toBe(0xb1b0afba);
    const view = new DataView(bytes.buffer, bytes.byteOffset);
    const count = view.getUint16(4);
    for (let index = 0; index < count; index++) {
      const record = 12 + index * 16;
      const offset = view.getUint32(record + 8);
      const length = view.getUint32(record + 12);
      expect(offset % 4).toBe(0);
      const tag = String.fromCharCode(...bytes.slice(record, record + 4));
      if (tag === "head") continue;
      expect(checksum(bytes.slice(offset, offset + length))).toBe(view.getUint32(record + 4));
    }
  });

  test("is deterministic for a fixed date", () => {
    const date = new Date("2026-10-20T00:00:00Z");
    expect(build_font(sample(), date)).toEqual(build_font(sample(), date));
  });
});

describe("place_glyph", () => {
  test("advance is the ink width plus a bearing each side plus the nudges", () => {
    const glyph = { strokes: [line(200, 0, 200, 500)] };
    const plain = place_glyph(glyph, 60)!;
    const nudged = place_glyph({ ...glyph, lsb: 20, rsb: -10 }, 60)!;
    expect(nudged.advance - plain.advance).toBe(10);
    const xs = nudged.contours.flat().map((point) => point.x);
    expect(Math.min(...xs)).toBe(80);
    expect(place_glyph({ strokes: [] }, 60)).toBeNull();
  });
});
