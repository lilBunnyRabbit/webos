import { ImageKind } from "./type";

export interface Block {
  type: string;
  start: number;
  end: number;
  data: Uint8Array;
}

export interface JpegSegment extends Block {
  marker: number;
}

export const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const JPEG_SOS = 0xda;
export const JPEG_EOI = 0xd9;

const ascii = new TextDecoder("latin1");

function starts_with(bytes: Uint8Array, prefix: readonly number[] | string, at = 0): boolean {
  const codes = typeof prefix === "string" ? Array.from(prefix, (char) => char.charCodeAt(0)) : prefix;
  return bytes.length >= at + codes.length && codes.every((code, index) => bytes[at + index] === code);
}

export function image_kind(bytes: Uint8Array): ImageKind | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return ImageKind.JPEG;
  if (starts_with(bytes, PNG_SIGNATURE)) return ImageKind.PNG;
  if (starts_with(bytes, "RIFF") && starts_with(bytes, "WEBP", 8)) return ImageKind.WEBP;
  return null;
}

export function has_prefix(data: Uint8Array, prefix: string): boolean {
  return starts_with(data, prefix);
}

// Stops at the first SOS: past it is entropy-coded data, not segments.
export function jpeg_segments(bytes: Uint8Array): JpegSegment[] {
  const out: JpegSegment[] = [];
  if (image_kind(bytes) !== ImageKind.JPEG) return out;
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const start = at;
    while (bytes[at + 1] === 0xff && at + 2 < bytes.length) at++;
    const marker = bytes[at + 1];
    if (marker === JPEG_EOI) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2) break;
    const end = Math.min(bytes.length, at + 2 + length);
    out.push({ type: marker.toString(16).toUpperCase(), marker, start, end, data: bytes.subarray(at + 4, end) });
    if (marker === JPEG_SOS) break;
    at = end;
  }
  return out;
}

// Entropy-coded data stuffs every 0xFF with 0x00, so the first FF D9 is the EOI; bytes after it are appended images.
export function jpeg_image_end(bytes: Uint8Array, from: number): number {
  for (let at = from; at + 1 < bytes.length; at++) {
    if (bytes[at] === 0xff && bytes[at + 1] === JPEG_EOI) return at + 2;
  }
  return bytes.length;
}

export function png_chunks(bytes: Uint8Array): Block[] {
  const out: Block[] = [];
  if (image_kind(bytes) !== ImageKind.PNG) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = PNG_SIGNATURE.length;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > bytes.length) break;
    const type = ascii.decode(bytes.subarray(at + 4, at + 8));
    out.push({ type, start: at, end, data: bytes.subarray(at + 8, at + 8 + length) });
    if (type === "IEND") break;
    at = end;
  }
  return out;
}

export function webp_chunks(bytes: Uint8Array): Block[] {
  const out: Block[] = [];
  if (image_kind(bytes) !== ImageKind.WEBP) return out;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const limit = Math.min(bytes.length, 8 + view.getUint32(4, true));
  let at = 12;
  while (at + 8 <= limit) {
    const length = view.getUint32(at + 4, true);
    const data_end = at + 8 + length;
    if (data_end > limit) break;
    const type = ascii.decode(bytes.subarray(at, at + 4));
    const end = Math.min(limit, data_end + (length & 1));
    out.push({ type, start: at, end, data: bytes.subarray(at + 8, data_end) });
    at = end;
  }
  return out;
}
