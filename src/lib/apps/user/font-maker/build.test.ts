import { describe, expect, test } from "vitest";
import { read_font, FontFormat } from "../font-viewer/font";
import { split_collection } from "$lib/core/utils/font-collection";
import { build_face, build_family, build_font, build_variable, place_glyph, variable_blockers } from "./build";
import { CharSet } from "./charsets";
import { add_stroke, create_project, set_weights, type FontProject, type Stroke } from "./model";
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

const tables = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, DataView>();
  for (let index = 0; index < view.getUint16(4); index++) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(...bytes.slice(record, record + 4));
    out.set(tag, new DataView(bytes.buffer, bytes.byteOffset + view.getUint32(record + 8), view.getUint32(record + 12)));
  }
  return out;
};

const equal_bytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((value, index) => value === b[index]);

const DATE = new Date("2026-10-21T00:00:00Z");
const three_weights = () => set_weights(sample(), [{ weight: 300, scale: 0.6 }, { weight: 400, scale: 1 }, { weight: 700, scale: 1.7 }]);

describe("build_family", () => {
  test("is a collection of every weight upright then italic, each named and flagged", async () => {
    const faces = split_collection(build_family(three_weights(), DATE));
    expect(faces).toHaveLength(6);
    const read = await Promise.all(faces.map((face) => read_font(buffer(face))));
    expect(read.map((info) => info.style)).toEqual(["Light", "Regular", "Bold", "Light Italic", "Italic", "Bold Italic"]);
    expect(read.map((info) => info.weight)).toEqual([300, 400, 700, 300, 400, 700]);
    expect(faces.map((face) => tables(face).get("OS/2")!.getUint16(62))).toEqual([0xc0, 0xc0, 0xa0, 0x81, 0x81, 0xa1]);
    expect(faces.map((face) => tables(face).get("head")!.getUint16(44))).toEqual([0, 0, 1, 2, 2, 3]);
    expect(tables(faces[4]).get("post")!.getInt32(4)).toBe(-10 * 65536);
  });

  test("each face in the collection is the face built on its own", () => {
    const faces = split_collection(build_family(sample(), DATE));
    expect(equal_bytes(faces[0], build_font(sample(), DATE))).toBe(true);
    expect(equal_bytes(faces[1], build_face(sample(), { weight: 700, italic: false }, DATE))).toBe(true);
  });

  test("bold glyphs are wider than regular ones", () => {
    const faces = split_collection(build_family(sample(), DATE));
    const advance = (face: Uint8Array, glyph: number) => tables(face).get("hmtx")!.getUint16(glyph * 4);
    expect(advance(faces[1], 3)).toBeGreaterThan(advance(faces[0], 3));
  });
});

describe("build_variable", () => {
  test("adds a wght axis from the lightest to the heaviest weight, default at regular", () => {
    const project = three_weights();
    expect(variable_blockers(project)).toEqual([]);
    const font = tables(build_variable(project, false, DATE));
    const fvar = font.get("fvar")!;
    expect(String.fromCharCode(fvar.getUint8(16), fvar.getUint8(17), fvar.getUint8(18), fvar.getUint8(19))).toBe("wght");
    expect([fvar.getUint32(20), fvar.getUint32(24), fvar.getUint32(28)].map((value) => value / 65536)).toEqual([300, 400, 700]);
    expect(fvar.getUint16(12)).toBe(3);
    expect(font.has("gvar")).toBe(true);
  });

  test("a weight redraw with a different stroke count blocks it and names the glyph", () => {
    const project = add_stroke(sample(), "o", line(0, 0, 10, 300), { kind: "weight", weight: 700 });
    expect(variable_blockers(project)).toEqual(["o"]);
    expect(() => build_variable(project)).toThrow(/o/);
    expect(variable_blockers(project, true)).toEqual(["o"]);
  });
});
