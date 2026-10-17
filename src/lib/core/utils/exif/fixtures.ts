import { crc32 } from "../zip/crc32";

// Hand-built files for tests: just enough structure for the reader, no real pixels.

export interface TiffEntry {
  tag: number;
  type: number;
  values: number[] | string;
}

const SIZE: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 10: 8 };

export function concat(...parts: (Uint8Array | number[])[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => char.charCodeAt(0));
}

function value_bytes(entry: TiffEntry, little: boolean): Uint8Array {
  if (typeof entry.values === "string") return latin1(`${entry.values}\0`);
  const size = SIZE[entry.type];
  const out = new Uint8Array(entry.values.length * size);
  const view = new DataView(out.buffer);
  entry.values.forEach((value, index) => {
    const at = index * size;
    if (entry.type === 3) view.setUint16(at, value, little);
    else if (entry.type === 4) view.setUint32(at, value, little);
    else if (entry.type === 5 || entry.type === 10) {
      const bottom = Number.isInteger(value) ? 1 : 1000;
      view.setUint32(at, Math.round(value * bottom), little);
      view.setUint32(at + 4, bottom, little);
    } else out[at] = value;
  });
  return out;
}

export function tiff(ifd0: TiffEntry[], exif: TiffEntry[] = [], gps: TiffEntry[] = [], little = false): Uint8Array {
  const tables = [ifd0, exif, gps].filter((entries, index) => index === 0 || entries.length > 0);
  const pointers = [exif.length ? 0x8769 : 0, gps.length ? 0x8825 : 0].filter(Boolean);
  const head = [...ifd0, ...pointers.map((tag) => ({ tag, type: 4, values: [0] }))];
  const all = [head, ...tables.slice(1)];
  const sizes = all.map((entries) => 2 + entries.length * 12 + 4 + entries.reduce((sum, entry) => {
    const length = value_bytes(entry, little).length;
    return sum + (length > 4 ? length + (length & 1) : 0);
  }, 0));
  const offsets = sizes.map((_, index) => 8 + sizes.slice(0, index).reduce((sum, size) => sum + size, 0));
  pointers.forEach((tag, index) => (head.find((entry) => entry.tag === tag)!.values = [offsets[index + 1]]));

  const out = new Uint8Array(offsets.at(-1)! + sizes.at(-1)!);
  const view = new DataView(out.buffer);
  out.set(little ? [0x49, 0x49, 42, 0] : [0x4d, 0x4d, 0, 42]);
  view.setUint32(4, 8, little);
  all.forEach((entries, table) => {
    const start = offsets[table];
    let extra = start + 2 + entries.length * 12 + 4;
    view.setUint16(start, entries.length, little);
    entries.forEach((entry, index) => {
      const at = start + 2 + index * 12;
      const bytes = value_bytes(entry, little);
      view.setUint16(at, entry.tag, little);
      view.setUint16(at + 2, entry.type, little);
      view.setUint32(at + 4, typeof entry.values === "string" ? bytes.length : entry.values.length, little);
      if (bytes.length <= 4) out.set(bytes, at + 8);
      else {
        view.setUint32(at + 8, extra, little);
        out.set(bytes, extra);
        extra += bytes.length + (bytes.length & 1);
      }
    });
  });
  return out;
}

function segment(marker: number, data: Uint8Array): Uint8Array {
  return concat([0xff, marker, (data.length + 2) >> 8, (data.length + 2) & 0xff], data);
}

export interface JpegParts {
  exif?: Uint8Array;
  xmp?: string;
  comment?: string;
  icc?: boolean;
  width?: number;
  height?: number;
  trailing?: Uint8Array;
}

export const JPEG_SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56];

export function jpeg(parts: JpegParts = {}): Uint8Array {
  const { width = 640, height = 480 } = parts;
  return concat(
    [0xff, 0xd8],
    segment(0xe0, concat(latin1("JFIF\0"), [1, 1, 1, 0, 72, 0, 72, 0, 0])),
    parts.exif ? segment(0xe1, concat(latin1("Exif\0\0"), parts.exif)) : [],
    parts.xmp ? segment(0xe1, concat(latin1("http://ns.adobe.com/xap/1.0/\0"), latin1(parts.xmp))) : [],
    parts.icc ? segment(0xe2, concat(latin1("ICC_PROFILE\0"), [1, 1, 0, 0, 0, 0])) : [],
    segment(0xdb, new Uint8Array(65)),
    parts.comment ? segment(0xfe, latin1(parts.comment)) : [],
    segment(0xc0, Uint8Array.from([8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1])),
    segment(0xda, Uint8Array.from([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0])),
    JPEG_SCAN,
    [0xff, 0xd9],
    parts.trailing ?? []
  );
}

export function png_chunk(type: string, data: Uint8Array | number[]): Uint8Array {
  const body = concat(latin1(type), data);
  const out = concat([0, 0, 0, 0], body, [0, 0, 0, 0]);
  const view = new DataView(out.buffer);
  view.setUint32(0, body.length - 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

export function png(...chunks: Uint8Array[]): Uint8Array {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, 320);
  view.setUint32(4, 200);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return concat(
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    png_chunk("IHDR", ihdr),
    ...chunks,
    png_chunk("IDAT", [0x78, 0x9c, 0x03, 0x00, 0x00, 0x00, 0x00, 0x01]),
    png_chunk("IEND", [])
  );
}

export function riff_chunk(type: string, data: Uint8Array | number[]): Uint8Array {
  const out = concat(latin1(type), [0, 0, 0, 0], data, data.length & 1 ? [0] : []);
  new DataView(out.buffer).setUint32(4, data.length, true);
  return out;
}

export function webp(...chunks: Uint8Array[]): Uint8Array {
  const body = concat(latin1("WEBP"), ...chunks);
  const out = concat(latin1("RIFF"), [0, 0, 0, 0], body);
  new DataView(out.buffer).setUint32(4, body.length, true);
  return out;
}

export function vp8x(flags: number, width: number, height: number): Uint8Array {
  const data = new Uint8Array(10);
  data[0] = flags;
  data.set([(width - 1) & 0xff, ((width - 1) >> 8) & 0xff, (width - 1) >> 16], 4);
  data.set([(height - 1) & 0xff, ((height - 1) >> 8) & 0xff, (height - 1) >> 16], 7);
  return riff_chunk("VP8X", data);
}

export function vp8l(width: number, height: number): Uint8Array {
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  return riff_chunk("VP8L", [0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff, 0]);
}
