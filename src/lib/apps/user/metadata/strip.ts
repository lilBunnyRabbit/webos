import { file_stem } from "$lib/core/api/services/files/path";
import { ImageKind, orientation } from "$kit/utils/exif";
import {
  JPEG_SOS,
  PNG_SIGNATURE,
  has_prefix,
  image_kind,
  jpeg_image_end,
  jpeg_segments,
  png_chunks,
  webp_chunks,
  type JpegSegment,
} from "$kit/utils/exif/containers";
import { EXIF_HEADER } from "$kit/utils/exif/read";
import { crc32 } from "$lib/core/utils/zip/crc32";

export interface StripOptions {
  keep_orientation: boolean;
}

export interface StripResult {
  bytes: Uint8Array;
  removed: number;
}

const PNG_DROPPED = new Set(["tEXt", "iTXt", "zTXt", "tIME", "eXIf"]);
const WEBP_DROPPED = new Set(["EXIF", "XMP "]);
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function orientation_tiff(value: number): Uint8Array {
  return Uint8Array.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, value, 0, 0, 0, 0, 0, 0]);
}

// Colour and decoding depend on these: JFIF density, the ICC profile, and Adobe's transform flag for CMYK.
function keeps_segment({ marker, data }: JpegSegment): boolean {
  if (marker === 0xfe) return false;
  if (marker < 0xe0 || marker > 0xef) return true;
  if (marker === 0xe0) return has_prefix(data, "JFIF\0") || has_prefix(data, "JFXX\0");
  if (marker === 0xe2) return has_prefix(data, "ICC_PROFILE\0");
  return marker === 0xee && has_prefix(data, "Adobe");
}

function strip_jpeg(bytes: Uint8Array, turn: number): StripResult {
  const segments = jpeg_segments(bytes);
  const scan = segments.at(-1);
  if (scan?.marker !== JPEG_SOS) throw new Error("This JPEG has no image data.");
  const parts = [bytes.subarray(0, 2)];
  let removed = 0;
  let placed = turn === 1;
  for (const segment of segments) {
    if (!placed && segment.marker !== 0xe0) {
      const body = concat([latin1(EXIF_HEADER), orientation_tiff(turn)]);
      parts.push(Uint8Array.from([0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff]), body);
      placed = true;
    }
    if (keeps_segment(segment)) parts.push(bytes.subarray(segment.start, segment.end));
    else removed++;
  }
  const end = jpeg_image_end(bytes, scan.end);
  parts.push(bytes.subarray(scan.end, end));
  if (end < bytes.length) removed++;
  return { bytes: concat(parts), removed };
}

function png_chunk(type: string, data: Uint8Array): Uint8Array {
  const body = concat([latin1(type), data]);
  const out = new Uint8Array(body.length + 8);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(out.length - 4, crc32(body));
  return out;
}

function strip_png(bytes: Uint8Array, turn: number): StripResult {
  const parts: Uint8Array[] = [Uint8Array.from(PNG_SIGNATURE)];
  let removed = 0;
  for (const chunk of png_chunks(bytes)) {
    if (PNG_DROPPED.has(chunk.type)) {
      removed++;
      continue;
    }
    parts.push(bytes.subarray(chunk.start, chunk.end));
    if (chunk.type === "IHDR" && turn !== 1) parts.push(png_chunk("eXIf", orientation_tiff(turn)));
  }
  return { bytes: concat(parts), removed };
}

function riff_chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + data.length + (data.length & 1));
  out.set(latin1(type));
  new DataView(out.buffer).setUint32(4, data.length, true);
  out.set(data, 8);
  return out;
}

function strip_webp(bytes: Uint8Array, turn: number): StripResult {
  const chunks = webp_chunks(bytes);
  const extended = chunks.some((chunk) => chunk.type === "VP8X");
  const keep_exif = extended && turn !== 1;
  const parts: Uint8Array[] = [];
  let removed = 0;
  for (const chunk of chunks) {
    if (WEBP_DROPPED.has(chunk.type)) {
      removed++;
      continue;
    }
    const copy = bytes.slice(chunk.start, chunk.end);
    if (chunk.type === "VP8X") copy[8] = (copy[8] & ~(VP8X_EXIF | VP8X_XMP)) | (keep_exif ? VP8X_EXIF : 0);
    parts.push(copy);
  }
  if (keep_exif) parts.push(riff_chunk("EXIF", orientation_tiff(turn)));
  const body = concat([latin1("WEBP"), ...parts]);
  const header = concat([latin1("RIFF"), new Uint8Array(4)]);
  new DataView(header.buffer).setUint32(4, body.length, true);
  return { bytes: concat([header, body]), removed };
}

export function strip_metadata(bytes: Uint8Array, { keep_orientation }: StripOptions): StripResult {
  const kind = image_kind(bytes);
  const turn = keep_orientation ? orientation(bytes) : 1;
  if (kind === ImageKind.JPEG) return strip_jpeg(bytes, turn);
  if (kind === ImageKind.PNG) return strip_png(bytes, turn);
  if (kind === ImageKind.WEBP) return strip_webp(bytes, turn);
  throw new Error("Only JPEG, PNG and WebP images can be stripped.");
}

export function stripped_name(name: string): string {
  const dot = name.lastIndexOf(".");
  return `${file_stem(name)}-clean${dot > 0 ? name.slice(dot) : ""}`;
}
