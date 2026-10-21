export const FONT_ACCEPT = [".ttf", ".otf", ".woff", ".woff2", ".ttc", "font/ttf", "font/otf", "font/woff", "font/woff2", "font/collection"];

export const FontFormat = {
  TRUETYPE: "TrueType",
  OPENTYPE: "OpenType (CFF)",
  WOFF: "WOFF",
  WOFF2: "WOFF2",
  COLLECTION: "Font collection",
  UNKNOWN: "Unknown",
} as const;
export type FontFormat = (typeof FontFormat)[keyof typeof FontFormat];

export interface FontAxis {
  tag: string;
  name: string;
  min: number;
  default: number;
  max: number;
}

export interface FontInstance {
  name: string;
  coordinates: Record<string, number>;
}

export interface FontInfo {
  format: FontFormat;
  family: string | null;
  style: string | null;
  full_name: string | null;
  version: string | null;
  designer: string | null;
  glyphs: number | null;
  weight: number | null;
  axes: FontAxis[];
  instances: FontInstance[];
  /** `null` when the font's cmap couldn't be read: every character is then shown as if present. */
  codepoints: Set<number> | null;
}

const tag_at = (view: DataView, offset: number) =>
  String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));

export function detect_format(bytes: Uint8Array): FontFormat {
  if (bytes.length < 4) return FontFormat.UNKNOWN;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = tag_at(view, 0);
  if (tag === "wOFF") return FontFormat.WOFF;
  if (tag === "wOF2") return FontFormat.WOFF2;
  if (tag === "OTTO") return FontFormat.OPENTYPE;
  if (tag === "ttcf") return FontFormat.COLLECTION;
  if (tag === "true" || view.getUint32(0) === 0x00010000) return FontFormat.TRUETYPE;
  return FontFormat.UNKNOWN;
}

type Tables = Map<string, DataView>;

function sfnt_tables(view: DataView): Tables {
  const tables: Tables = new Map();
  const count = view.getUint16(4);
  for (let index = 0; index < count; index++) {
    const record = 12 + index * 16;
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    tables.set(tag_at(view, record), new DataView(view.buffer, view.byteOffset + offset, length));
  }
  return tables;
}

async function inflate(data: DataView): Promise<DataView> {
  const stream = new Blob([new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new DataView(await new Response(stream).arrayBuffer());
}

async function woff_tables(view: DataView): Promise<Tables> {
  const tables: Tables = new Map();
  const count = view.getUint16(12);
  for (let index = 0; index < count; index++) {
    const record = 44 + index * 20;
    const offset = view.getUint32(record + 4);
    const packed = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    const data = new DataView(view.buffer, view.byteOffset + offset, packed);
    tables.set(tag_at(view, record), packed < length ? await inflate(data) : data);
  }
  return tables;
}

const decode_utf16 = (bytes: Uint8Array) => new TextDecoder("utf-16be").decode(bytes);
const decode_latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);

export function read_names(name: DataView): Map<number, string> {
  const count = name.getUint16(2);
  const storage = name.getUint16(4);
  const ranked = new Map<number, { rank: number; text: string }>();
  for (let index = 0; index < count; index++) {
    const record = 6 + index * 12;
    const platform = name.getUint16(record);
    const encoding = name.getUint16(record + 2);
    const language = name.getUint16(record + 4);
    const id = name.getUint16(record + 6);
    const length = name.getUint16(record + 8);
    const offset = name.getUint16(record + 10);
    const bytes = new Uint8Array(name.buffer, name.byteOffset + storage + offset, length);
    const rank = platform === 3 && language === 0x409 ? 3 : platform === 3 || platform === 0 ? 2 : platform === 1 && encoding === 0 ? 1 : 0;
    if (!rank || (ranked.get(id)?.rank ?? 0) >= rank) continue;
    ranked.set(id, { rank, text: platform === 1 ? decode_latin1(bytes) : decode_utf16(bytes) });
  }
  return new Map([...ranked].map(([id, { text }]) => [id, text.trim()]));
}

const fixed = (view: DataView, offset: number) => Math.round((view.getInt32(offset) / 65536) * 1000) / 1000;

export function read_fvar(fvar: DataView, names: Map<number, string>): { axes: FontAxis[]; instances: FontInstance[] } {
  const axes_offset = fvar.getUint16(4);
  const axis_count = fvar.getUint16(8);
  const axis_size = fvar.getUint16(10);
  const instance_count = fvar.getUint16(12);
  const instance_size = fvar.getUint16(14);

  const axes: FontAxis[] = [];
  for (let index = 0; index < axis_count; index++) {
    const record = axes_offset + index * axis_size;
    const tag = tag_at(fvar, record);
    axes.push({
      tag,
      name: names.get(fvar.getUint16(record + 18)) ?? tag,
      min: fixed(fvar, record + 4),
      default: fixed(fvar, record + 8),
      max: fixed(fvar, record + 12),
    });
  }

  const instances: FontInstance[] = [];
  const instances_offset = axes_offset + axis_count * axis_size;
  for (let index = 0; index < instance_count; index++) {
    const record = instances_offset + index * instance_size;
    const coordinates = Object.fromEntries(axes.map((axis, at) => [axis.tag, fixed(fvar, record + 4 + at * 4)]));
    instances.push({ name: names.get(fvar.getUint16(record)) ?? `Instance ${index + 1}`, coordinates });
  }
  return { axes, instances };
}

function cmap_format4(table: DataView, at: number, into: Set<number>) {
  const segments = table.getUint16(at + 6) / 2;
  const ends = at + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;
  for (let segment = 0; segment < segments; segment++) {
    const end = table.getUint16(ends + segment * 2);
    const start = table.getUint16(starts + segment * 2);
    const delta = table.getUint16(deltas + segment * 2);
    const range_at = ranges + segment * 2;
    const range = table.getUint16(range_at);
    for (let code = start; code <= end && code !== 0xffff; code++) {
      let glyph = 0;
      if (range === 0) glyph = (code + delta) & 0xffff;
      else {
        const raw = table.getUint16(range_at + range + (code - start) * 2);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }
      if (glyph) into.add(code);
    }
  }
}

function cmap_format12(table: DataView, at: number, into: Set<number>) {
  const groups = table.getUint32(at + 12);
  for (let group = 0; group < groups; group++) {
    const record = at + 16 + group * 12;
    const start = table.getUint32(record);
    const end = Math.min(table.getUint32(record + 4), 0x10ffff);
    for (let code = start; code <= end; code++) into.add(code);
  }
}

export function read_cmap(cmap: DataView): Set<number> | null {
  const count = cmap.getUint16(2);
  const subtables: { platform: number; encoding: number; at: number; format: number }[] = [];
  for (let index = 0; index < count; index++) {
    const record = 4 + index * 8;
    const at = cmap.getUint32(record + 4);
    subtables.push({ platform: cmap.getUint16(record), encoding: cmap.getUint16(record + 2), at, format: cmap.getUint16(at) });
  }
  const unicode = (entry: (typeof subtables)[number]) => entry.platform === 0 || (entry.platform === 3 && (entry.encoding === 1 || entry.encoding === 10));
  const best = subtables.find((entry) => unicode(entry) && entry.format === 12) ?? subtables.find((entry) => unicode(entry) && entry.format === 4);
  if (!best) return null;
  const codepoints = new Set<number>();
  if (best.format === 12) cmap_format12(cmap, best.at, codepoints);
  else cmap_format4(cmap, best.at, codepoints);
  return codepoints;
}

export const empty_info = (format: FontFormat): FontInfo => ({
  format,
  family: null,
  style: null,
  full_name: null,
  version: null,
  designer: null,
  glyphs: null,
  weight: null,
  axes: [],
  instances: [],
  codepoints: null,
});

/** Reads what the font says about itself. WOFF2 tables are Brotli-compressed, which the platform can't inflate, so only its format is known. */
export async function read_font(buffer: ArrayBuffer): Promise<FontInfo> {
  const view = new DataView(buffer);
  const format = detect_format(new Uint8Array(buffer));
  let tables: Tables;
  if (format === FontFormat.TRUETYPE || format === FontFormat.OPENTYPE) tables = sfnt_tables(view);
  else if (format === FontFormat.WOFF) tables = await woff_tables(view);
  else return empty_info(format);

  const name = tables.get("name");
  const names = name ? read_names(name) : new Map<number, string>();
  const fvar = tables.get("fvar");
  const maxp = tables.get("maxp");
  const os2 = tables.get("OS/2");
  const cmap = tables.get("cmap");
  return {
    format,
    family: names.get(16) ?? names.get(1) ?? null,
    style: names.get(17) ?? names.get(2) ?? null,
    full_name: names.get(4) ?? null,
    version: names.get(5) ?? null,
    designer: names.get(9) ?? null,
    glyphs: maxp ? maxp.getUint16(4) : null,
    weight: os2 && os2.byteLength >= 6 ? os2.getUint16(4) : null,
    ...(fvar ? read_fvar(fvar, names) : { axes: [], instances: [] }),
    codepoints: cmap ? read_cmap(cmap) : null,
  };
}

export function variation_settings(values: Record<string, number>): string {
  const entries = Object.entries(values);
  return entries.length ? entries.map(([tag, value]) => `"${tag}" ${value}`).join(", ") : "normal";
}

export interface CharacterGroup {
  name: string;
  codepoints: number[];
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

export const CHARACTER_GROUPS: CharacterGroup[] = [
  { name: "Uppercase", codepoints: range(0x41, 0x5a) },
  { name: "Lowercase", codepoints: range(0x61, 0x7a) },
  { name: "Digits", codepoints: range(0x30, 0x39) },
  { name: "Punctuation and symbols", codepoints: [...range(0x21, 0x2f), ...range(0x3a, 0x40), ...range(0x5b, 0x60), ...range(0x7b, 0x7e)] },
  { name: "Latin-1 Supplement", codepoints: range(0xa1, 0xff).filter((code) => code !== 0xad) },
  {
    name: "Typographic",
    codepoints: [0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e, 0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122, 0x2212],
  },
];

export const WATERFALL_SIZES = [12, 14, 16, 20, 24, 32, 40, 48, 64, 80, 96];

export const code_label = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;
