import { style_name, WEIGHT_NAMES } from "./model";
import { contour_bounds, type Bounds, type Contour } from "./outline";

export interface TtfMaster {
  contours: Contour[];
  advance: number;
}

export interface TtfGlyph {
  codepoints: number[];
  contours: Contour[];
  advance: number;
  /** One per `variation.masters` entry, point for point the same as `contours`. */
  masters?: TtfMaster[];
}

export interface TtfVariation {
  min: number;
  max: number;
  /** Weights of the glyphs' `masters`, in order; the font's own weight is the default. */
  masters: number[];
  instances: number[];
}

export interface TtfFont {
  family: string;
  weight: number;
  italic: boolean;
  /** Degrees, for the caret and `post.italicAngle`. */
  slant: number;
  units_per_em: number;
  ascent: number;
  descent: number;
  cap_height: number;
  x_height: number;
  glyphs: TtfGlyph[];
  variation?: TtfVariation;
  created?: Date;
}

class ByteWriter {
  private buffer: Uint8Array<ArrayBuffer> = new Uint8Array(256);
  private view = new DataView(this.buffer.buffer);
  length = 0;

  private reserve(size: number) {
    if (this.length + size <= this.buffer.length) return;
    let capacity = this.buffer.length * 2;
    while (capacity < this.length + size) capacity *= 2;
    const next = new Uint8Array(capacity);
    next.set(this.buffer);
    this.buffer = next;
    this.view = new DataView(next.buffer);
  }

  u8(value: number) {
    this.reserve(1);
    this.view.setUint8(this.length, value);
    this.length += 1;
    return this;
  }

  i8(value: number) {
    this.reserve(1);
    this.view.setInt8(this.length, value);
    this.length += 1;
    return this;
  }

  u16(value: number) {
    this.reserve(2);
    this.view.setUint16(this.length, value);
    this.length += 2;
    return this;
  }

  i16(value: number) {
    this.reserve(2);
    this.view.setInt16(this.length, value);
    this.length += 2;
    return this;
  }

  u32(value: number) {
    this.reserve(4);
    this.view.setUint32(this.length, value >>> 0);
    this.length += 4;
    return this;
  }

  tag(value: string) {
    for (let index = 0; index < 4; index++) this.u8(value.charCodeAt(index) || 32);
    return this;
  }

  bytes(values: Uint8Array) {
    this.reserve(values.length);
    this.buffer.set(values, this.length);
    this.length += values.length;
    return this;
  }

  pad(alignment = 4) {
    while (this.length % alignment) this.u8(0);
    return this;
  }

  done(): Uint8Array<ArrayBuffer> {
    return this.buffer.slice(0, this.length);
  }
}

const SECONDS_1904_TO_1970 = 2082844800;

function long_datetime(writer: ByteWriter, date: Date) {
  const seconds = Math.floor(date.getTime() / 1000) + SECONDS_1904_TO_1970;
  writer.u32(Math.floor(seconds / 2 ** 32)).u32(seconds % 2 ** 32);
}

export function checksum(bytes: Uint8Array): number {
  let sum = 0;
  const padded = bytes.length % 4 ? new Uint8Array(bytes.length + 4 - (bytes.length % 4)) : bytes;
  if (padded !== bytes) padded.set(bytes);
  const view = new DataView(padded.buffer, padded.byteOffset, padded.byteLength);
  for (let offset = 0; offset < padded.length; offset += 4) sum = (sum + view.getUint32(offset)) >>> 0;
  return sum;
}

interface EncodedGlyph {
  data: Uint8Array;
  bounds: Bounds | null;
  points: number;
  contours: number;
}

function encode_glyph(contours: Contour[]): EncodedGlyph {
  const kept = contours.filter((contour) => contour.length > 0);
  const bounds = contour_bounds(kept);
  if (!bounds) return { data: new Uint8Array(0), bounds: null, points: 0, contours: 0 };
  const writer = new ByteWriter();
  writer.i16(kept.length).i16(bounds.x_min).i16(bounds.y_min).i16(bounds.x_max).i16(bounds.y_max);
  let end = -1;
  for (const contour of kept) {
    end += contour.length;
    writer.u16(end);
  }
  writer.u16(0);
  const flags = new ByteWriter();
  const xs = new ByteWriter();
  const ys = new ByteWriter();
  let x = 0;
  let y = 0;
  for (const contour of kept) {
    for (const point of contour) {
      const dx = point.x - x;
      const dy = point.y - y;
      x = point.x;
      y = point.y;
      let flag = point.on ? 0x01 : 0;
      if (dx === 0) flag |= 0x10;
      else if (Math.abs(dx) < 256) {
        flag |= 0x02 | (dx > 0 ? 0x10 : 0);
        xs.u8(Math.abs(dx));
      } else xs.i16(dx);
      if (dy === 0) flag |= 0x20;
      else if (Math.abs(dy) < 256) {
        flag |= 0x04 | (dy > 0 ? 0x20 : 0);
        ys.u8(Math.abs(dy));
      } else ys.i16(dy);
      flags.u8(flag);
    }
  }
  writer.bytes(flags.done()).bytes(xs.done()).bytes(ys.done()).pad(4);
  return { data: writer.done(), bounds, points: end + 1, contours: kept.length };
}

function utf16(text: string): Uint8Array {
  const writer = new ByteWriter();
  for (let index = 0; index < text.length; index++) writer.u16(text.charCodeAt(index));
  return writer.done();
}

/** Regular, Italic, Bold and Bold Italic share the family name; other weights get it as the typographic family (IDs 16, 17). */
function is_ribbi(weight: number): boolean {
  return weight === 400 || weight === 700;
}

export function postscript_name(family: string, style = "Regular"): string {
  const ascii = family.normalize("NFKD").replace(/[^A-Za-z0-9-]/g, "").slice(0, 50);
  return `${ascii || "FontMaker"}-${style.replaceAll(" ", "")}`;
}

function name_table(font: TtfFont): Uint8Array {
  const style = style_name(font.weight, font.italic);
  const ps = postscript_name(font.family, style);
  const ribbi = is_ribbi(font.weight);
  const entries: [number, string][] = [
    [1, ribbi ? font.family : `${font.family} ${WEIGHT_NAMES[font.weight] ?? font.weight}`],
    [2, ribbi ? style : font.italic ? "Italic" : "Regular"],
    [3, `${ps};Font Maker`],
    [4, style === "Regular" ? font.family : `${font.family} ${style}`],
    [5, "Version 1.000"],
    [6, ps],
  ];
  if (!ribbi) entries.push([16, font.family], [17, style]);
  if (font.variation) {
    entries.push([256, "Weight"]);
    font.variation.instances.forEach((weight, index) => entries.push([257 + index, style_name(weight, font.italic)]));
  }
  const encoded = entries.map(([id, text]) => [id, utf16(text)] as const);
  const writer = new ByteWriter().u16(0).u16(encoded.length).u16(6 + encoded.length * 12);
  let offset = 0;
  for (const [id, bytes] of encoded) {
    writer.u16(3).u16(1).u16(0x409).u16(id).u16(bytes.length).u16(offset);
    offset += bytes.length;
  }
  for (const [, bytes] of encoded) writer.bytes(bytes);
  return writer.done();
}

export function cmap_table(mapping: ReadonlyMap<number, number>): Uint8Array {
  const pairs = [...mapping].filter(([code]) => code < 0xffff).sort((a, b) => a[0] - b[0]);
  const segments: { start: number; end: number; delta: number }[] = [];
  for (const [code, glyph] of pairs) {
    const last = segments.at(-1);
    if (last && code === last.end + 1 && glyph - code === last.delta) last.end = code;
    else segments.push({ start: code, end: code, delta: glyph - code });
  }
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const count = segments.length;
  const search_range = 2 * 2 ** Math.floor(Math.log2(count));
  const sub = new ByteWriter()
    .u16(4)
    .u16(16 + count * 8)
    .u16(0)
    .u16(count * 2)
    .u16(search_range)
    .u16(Math.log2(search_range / 2))
    .u16(count * 2 - search_range);
  for (const segment of segments) sub.u16(segment.end);
  sub.u16(0);
  for (const segment of segments) sub.u16(segment.start);
  for (const segment of segments) sub.u16((segment.delta + 0x10000) % 0x10000);
  for (let index = 0; index < count; index++) sub.u16(0);
  return new ByteWriter().u16(0).u16(1).u16(3).u16(1).u32(12).bytes(sub.done()).done();
}

function unicode_ranges(codes: readonly number[]): [number, number, number, number] {
  const ranges: [number, number, number, number] = [0, 0, 0, 0];
  const set = (bit: number) => (ranges[bit >> 5] |= 1 << (bit & 31));
  for (const code of codes) {
    if (code < 0x80) set(0);
    else if (code < 0x100) set(1);
    else if (code < 0x180) set(2);
    else if (code < 0x250) set(3);
    else if (code >= 0x370 && code < 0x400) set(7);
    else if (code >= 0x2000 && code < 0x2070) set(31);
    else if (code >= 0x20a0 && code < 0x20d0) set(33);
    else if (code >= 0x2100 && code < 0x2150) set(35);
    else if (code >= 0x2190 && code < 0x2200) set(37);
    else if (code >= 0x2200 && code < 0x2300) set(38);
    else if (code >= 0x2600 && code < 0x2700) set(46);
    else if (code >= 0x2700 && code < 0x27c0) set(47);
  }
  for (let index = 0; index < 4; index++) ranges[index] >>>= 0;
  return ranges;
}

const fixed = (value: number) => Math.round(value * 65536) >>> 0;
const f2dot14 = (value: number) => Math.round(value * 16384);

/** Where a weight sits on the normalized axis: −1 at the lightest, 0 at the default, 1 at the heaviest. */
export function normalize_weight(weight: number, base: number, min: number, max: number): number {
  if (weight < base) return min === base ? 0 : (weight - base) / (base - min);
  if (weight > base) return max === base ? 0 : (weight - base) / (max - base);
  return 0;
}

function fvar_table(base: number, variation: TtfVariation): Uint8Array {
  const writer = new ByteWriter().u16(1).u16(0).u16(16).u16(2).u16(1).u16(20).u16(variation.instances.length).u16(8);
  writer.tag("wght").u32(fixed(variation.min)).u32(fixed(base)).u32(fixed(variation.max)).u16(0).u16(256);
  variation.instances.forEach((weight, index) => writer.u16(257 + index).u16(0).u32(fixed(weight)));
  return writer.done();
}

function pack_deltas(writer: ByteWriter, deltas: readonly number[]) {
  let index = 0;
  while (index < deltas.length) {
    const kind = deltas[index] === 0 ? 0 : Math.abs(deltas[index]) <= 127 ? 1 : 2;
    let end = index + 1;
    while (end < deltas.length && end - index < 64) {
      const value = deltas[end];
      const next = value === 0 ? 0 : Math.abs(value) <= 127 ? 1 : 2;
      if (next > kind) break;
      end++;
    }
    const run = end - index;
    if (kind === 0) writer.u8(0x80 | (run - 1));
    else if (kind === 1) {
      writer.u8(run - 1);
      for (let at = index; at < end; at++) writer.i8(deltas[at]);
    } else {
      writer.u8(0x40 | (run - 1));
      for (let at = index; at < end; at++) writer.i16(deltas[at]);
    }
    index = end;
  }
}

// One tuple per master with an intermediate region running to its neighbours, so weights in between interpolate
// piecewise between the two nearest masters instead of all at once.
function gvar_table(font: TtfFont, variation: TtfVariation): Uint8Array {
  const peaks = variation.masters.map((weight) => normalize_weight(weight, font.weight, variation.min, variation.max));
  const regions = peaks.map((peak) => {
    const same_side = peaks.filter((other) => Math.sign(other) === Math.sign(peak));
    const inner = same_side.filter((other) => Math.abs(other) < Math.abs(peak));
    const outer = same_side.filter((other) => Math.abs(other) > Math.abs(peak));
    const near = inner.length ? inner.reduce((a, b) => (Math.abs(a) > Math.abs(b) ? a : b)) : 0;
    const far = outer.length ? outer.reduce((a, b) => (Math.abs(a) < Math.abs(b) ? a : b)) : peak;
    return peak > 0 ? { start: near, peak, end: far } : { start: far, peak, end: near };
  });

  const data: Uint8Array[] = font.glyphs.map((glyph) => {
    const masters = glyph.masters;
    const base = glyph.contours.flat();
    if (!masters || !base.length) return new Uint8Array(0);
    const header_size = 4 + 2 * 3;
    const headers = new ByteWriter();
    const body = new ByteWriter().u8(0);
    masters.forEach((master, index) => {
      const points = master.contours.flat();
      const xs = [...points.map((point, at) => point.x - base[at].x), 0, Math.round(master.advance) - Math.round(glyph.advance), 0, 0];
      const ys = [...points.map((point, at) => point.y - base[at].y), 0, 0, 0, 0];
      const deltas = new ByteWriter();
      pack_deltas(deltas, xs);
      pack_deltas(deltas, ys);
      const region = regions[index];
      headers.u16(deltas.length).u16(0x8000 | 0x4000).i16(f2dot14(region.peak)).i16(f2dot14(region.start)).i16(f2dot14(region.end));
      body.bytes(deltas.done());
    });
    const writer = new ByteWriter().u16(0x8000 | masters.length).u16(4 + header_size * masters.length);
    return writer.bytes(headers.done()).bytes(body.done()).pad(2).done();
  });

  const offsets_size = (font.glyphs.length + 1) * 4;
  const array_offset = 20 + offsets_size;
  const writer = new ByteWriter().u16(1).u16(0).u16(1).u16(0).u32(array_offset).u16(font.glyphs.length).u16(1).u32(array_offset);
  let offset = 0;
  for (const entry of data) {
    writer.u32(offset);
    offset += entry.length;
  }
  writer.u32(offset);
  for (const entry of data) writer.bytes(entry);
  return writer.done();
}

export function write_ttf(font: TtfFont): Uint8Array<ArrayBuffer> {
  const encoded = font.glyphs.map((glyph) => encode_glyph(glyph.contours));
  const created = font.created ?? new Date();
  const caret_rise = font.italic ? 1000 : 1;
  const caret_run = font.italic ? Math.round(1000 * Math.tan((font.slant * Math.PI) / 180)) : 0;
  const bold_bit = font.weight === 700 ? 0x20 : 0;
  const fs_selection = (font.italic ? 0x01 : 0) | bold_bit | (!font.italic && !bold_bit ? 0x40 : 0) | 0x80;

  const glyf = new ByteWriter();
  const loca = new ByteWriter();
  for (const glyph of encoded) {
    loca.u32(glyf.length);
    glyf.bytes(glyph.data);
  }
  loca.u32(glyf.length);

  const hmtx = new ByteWriter();
  let advance_max = 0;
  let min_lsb = Infinity;
  let min_rsb = Infinity;
  let max_extent = -Infinity;
  let advance_sum = 0;
  let advance_count = 0;
  font.glyphs.forEach((glyph, index) => {
    const bounds = encoded[index].bounds;
    const advance = Math.max(0, Math.round(glyph.advance));
    hmtx.u16(advance).i16(bounds ? bounds.x_min : 0);
    advance_max = Math.max(advance_max, advance);
    if (advance > 0) {
      advance_sum += advance;
      advance_count++;
    }
    if (bounds) {
      min_lsb = Math.min(min_lsb, bounds.x_min);
      min_rsb = Math.min(min_rsb, advance - bounds.x_max);
      max_extent = Math.max(max_extent, bounds.x_max);
    }
  });
  if (!Number.isFinite(min_lsb)) min_lsb = min_rsb = max_extent = 0;

  const all = encoded.map((glyph) => glyph.bounds).filter((bounds): bounds is Bounds => bounds !== null);
  const total: Bounds = all.length
    ? {
        x_min: Math.min(...all.map((bounds) => bounds.x_min)),
        y_min: Math.min(...all.map((bounds) => bounds.y_min)),
        x_max: Math.max(...all.map((bounds) => bounds.x_max)),
        y_max: Math.max(...all.map((bounds) => bounds.y_max)),
      }
    : { x_min: 0, y_min: 0, x_max: 0, y_max: 0 };

  const head = new ByteWriter()
    .u32(0x00010000)
    .u32(0x00010000)
    .u32(0)
    .u32(0x5f0f3cf5)
    .u16(0x000b)
    .u16(font.units_per_em);
  long_datetime(head, created);
  long_datetime(head, created);
  head
    .i16(total.x_min)
    .i16(total.y_min)
    .i16(total.x_max)
    .i16(total.y_max)
    .u16((font.weight === 700 ? 1 : 0) | (font.italic ? 2 : 0))
    .u16(8)
    .i16(2)
    .i16(1)
    .i16(0);

  const hhea = new ByteWriter()
    .u32(0x00010000)
    .i16(font.ascent)
    .i16(-font.descent)
    .i16(0)
    .u16(advance_max)
    .i16(min_lsb)
    .i16(min_rsb)
    .i16(max_extent)
    .i16(caret_rise)
    .i16(caret_run)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .i16(0)
    .u16(font.glyphs.length);

  const maxp = new ByteWriter()
    .u32(0x00010000)
    .u16(font.glyphs.length)
    .u16(Math.max(0, ...encoded.map((glyph) => glyph.points)))
    .u16(Math.max(0, ...encoded.map((glyph) => glyph.contours)))
    .u16(0)
    .u16(0)
    .u16(2);
  for (let index = 0; index < 8; index++) maxp.u16(0);

  const mapping = new Map<number, number>();
  font.glyphs.forEach((glyph, index) => glyph.codepoints.forEach((code) => mapping.set(code, index)));
  const codes = [...mapping.keys()].sort((a, b) => a - b);
  const ranges = unicode_ranges(codes);
  const os2 = new ByteWriter()
    .u16(4)
    .i16(advance_count ? Math.round(advance_sum / advance_count) : 0)
    .u16(font.weight)
    .u16(5)
    .u16(0)
    .i16(650)
    .i16(600)
    .i16(0)
    .i16(75)
    .i16(650)
    .i16(600)
    .i16(0)
    .i16(350)
    .i16(50)
    .i16(Math.round(font.x_height / 2))
    .i16(0);
  for (let index = 0; index < 10; index++) os2.u8(0);
  for (const range of ranges) os2.u32(range);
  os2
    .tag("NONE")
    .u16(fs_selection)
    .u16(codes.length ? Math.min(codes[0], 0xffff) : 0)
    .u16(codes.length ? Math.min(codes[codes.length - 1], 0xffff) : 0)
    .i16(font.ascent)
    .i16(-font.descent)
    .i16(0)
    .u16(Math.max(font.ascent, total.y_max))
    .u16(Math.max(font.descent, -total.y_min))
    .u32(0b11)
    .u32(0)
    .i16(font.x_height)
    .i16(font.cap_height)
    .u16(0)
    .u16(32)
    .u16(1);

  const italic_angle = font.italic ? Math.round(-font.slant * 65536) : 0;
  const post = new ByteWriter().u32(0x00030000).u32(italic_angle).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);

  const tables: Record<string, Uint8Array> = {
    "OS/2": os2.done(),
    cmap: cmap_table(mapping),
    glyf: glyf.done(),
    head: head.done(),
    hhea: hhea.done(),
    hmtx: hmtx.done(),
    loca: loca.done(),
    maxp: maxp.done(),
    name: name_table(font),
    post: post.done(),
  };
  if (font.variation) {
    tables.fvar = fvar_table(font.weight, font.variation);
    tables.gvar = gvar_table(font, font.variation);
  }
  const TAG_ORDER = Object.keys(tables).sort();

  const count = TAG_ORDER.length;
  const search_range = 16 * 2 ** Math.floor(Math.log2(count));
  const out = new ByteWriter()
    .u32(0x00010000)
    .u16(count)
    .u16(search_range)
    .u16(Math.log2(search_range / 16))
    .u16(count * 16 - search_range);
  let offset = 12 + count * 16;
  const offsets: Record<string, number> = {};
  for (const tag of TAG_ORDER) {
    const data = tables[tag];
    offsets[tag] = offset;
    out.tag(tag).u32(checksum(data)).u32(offset).u32(data.length);
    offset += Math.ceil(data.length / 4) * 4;
  }
  for (const tag of TAG_ORDER) out.bytes(tables[tag]).pad(4);
  const bytes = out.done();
  const adjustment = (0xb1b0afba - checksum(bytes)) >>> 0;
  new DataView(bytes.buffer).setUint32(offsets.head + 8, adjustment);
  return bytes;
}
