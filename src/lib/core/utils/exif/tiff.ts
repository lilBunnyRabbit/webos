import { EXIF_POINTER, GPS_POINTER, GPS_TAGS, IMAGE_TAGS } from "./tags";
import type { ExifTags, ExifValue, GpsPosition } from "./type";

const TYPE_SIZE: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };
const ASCII = 2;
const UNDEFINED = 7;
const USER_COMMENT = 0x9286;
const MAX_VALUES = 64;
const MAX_ENTRIES = 512;

const latin1 = new TextDecoder("latin1");

interface Reader {
  view: DataView;
  bytes: Uint8Array;
  little: boolean;
}

function text(bytes: Uint8Array): string {
  const end = bytes.indexOf(0);
  return latin1.decode(end === -1 ? bytes : bytes.subarray(0, end)).trim();
}

function printable(bytes: Uint8Array): boolean {
  return bytes.every((byte) => byte === 0 || (byte >= 0x20 && byte < 0x7f));
}

function number_at(reader: Reader, type: number, at: number): number {
  const { view, little } = reader;
  switch (type) {
    case 3:
      return view.getUint16(at, little);
    case 4:
      return view.getUint32(at, little);
    case 5:
    case 10: {
      const signed = type === 10;
      const top = signed ? view.getInt32(at, little) : view.getUint32(at, little);
      const bottom = signed ? view.getInt32(at + 4, little) : view.getUint32(at + 4, little);
      return bottom === 0 ? 0 : top / bottom;
    }
    case 6:
      return view.getInt8(at);
    case 8:
      return view.getInt16(at, little);
    case 9:
      return view.getInt32(at, little);
    case 11:
      return view.getFloat32(at, little);
    case 12:
      return view.getFloat64(at, little);
    default:
      return view.getUint8(at);
  }
}

function value_at(reader: Reader, tag: number, type: number, count: number, at: number): ExifValue | null {
  const raw = reader.bytes.subarray(at, at + count * TYPE_SIZE[type]);
  if (type === ASCII) return text(raw) || null;
  if (tag === USER_COMMENT) return raw.length > 8 && text(raw.subarray(0, 8)) === "ASCII" ? text(raw.subarray(8)) || null : null;
  if (type === UNDEFINED) {
    if (count > 4 && count <= MAX_VALUES && printable(raw)) return text(raw) || null;
    if (count > 4) return null;
    if (printable(raw) && raw.some((byte) => byte !== 0)) return text(raw);
  }
  if (count > MAX_VALUES) return null;
  const values = Array.from({ length: count }, (_, index) => number_at(reader, type, at + index * TYPE_SIZE[type]));
  return count === 1 ? values[0] : values;
}

function read_ifd(reader: Reader, offset: number, names: Readonly<Record<number, string>>, into: ExifTags): Map<number, number> {
  const pointers = new Map<number, number>();
  const { view, little } = reader;
  if (offset < 8 || offset + 2 > view.byteLength) return pointers;
  const count = Math.min(view.getUint16(offset, little), MAX_ENTRIES);
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    if (entry + 12 > view.byteLength) break;
    const tag = view.getUint16(entry, little);
    const type = view.getUint16(entry + 2, little);
    const values = view.getUint32(entry + 4, little);
    const size = TYPE_SIZE[type];
    if (!size) continue;
    if (tag === EXIF_POINTER || tag === GPS_POINTER) {
      pointers.set(tag, view.getUint32(entry + 8, little));
      continue;
    }
    const name = names[tag];
    if (!name) continue;
    const at = size * values <= 4 ? entry + 8 : view.getUint32(entry + 8, little);
    if (at + size * values > view.byteLength) continue;
    const value = value_at(reader, tag, type, values, at);
    if (value !== null) into[name] = value;
  }
  return pointers;
}

export function read_tiff(bytes: Uint8Array): ExifTags | null {
  if (bytes.length < 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) return null;
  const little = order === 0x4949;
  if (view.getUint16(2, little) !== 42) return null;

  const reader: Reader = { view, bytes, little };
  const tags: ExifTags = {};
  const pointers = read_ifd(reader, view.getUint32(4, little), IMAGE_TAGS, tags);
  const exif = pointers.get(EXIF_POINTER);
  if (exif !== undefined) read_ifd(reader, exif, IMAGE_TAGS, tags);
  const gps = pointers.get(GPS_POINTER);
  if (gps !== undefined) read_ifd(reader, gps, GPS_TAGS, tags);
  return tags;
}

function degrees(value: ExifValue | undefined): number | null {
  if (typeof value === "number") return value;
  if (!Array.isArray(value) || value.length < 3) return null;
  return value[0] + value[1] / 60 + value[2] / 3600;
}

export function gps_position(tags: ExifTags): GpsPosition | null {
  const latitude = degrees(tags.GPSLatitude);
  const longitude = degrees(tags.GPSLongitude);
  if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const altitude = typeof tags.GPSAltitude === "number" ? tags.GPSAltitude * (tags.GPSAltitudeRef === 1 ? -1 : 1) : null;
  return {
    latitude: latitude * (tags.GPSLatitudeRef === "S" ? -1 : 1),
    longitude: longitude * (tags.GPSLongitudeRef === "W" ? -1 : 1),
    altitude,
  };
}
