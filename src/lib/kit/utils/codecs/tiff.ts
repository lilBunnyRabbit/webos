import { has_alpha } from "./pixels";
import type { Pixels } from "./ssim";

const SHORT = 3;
const LONG = 4;
const RATIONAL = 5;
const MAX_BYTES = 0xffffffff;

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Inline value, or the offset of the values when they don't fit in four bytes. */
  value: number;
}

// ExtraSamples 2 (unassociated alpha): ImageData is not premultiplied.
export function encode_tiff(image: Pixels): Uint8Array<ArrayBuffer> {
  const { width, height, data } = image;
  const alpha = has_alpha(image);
  const samples = alpha ? 4 : 3;
  const entry_count = alpha ? 14 : 13;
  const ifd = 8;
  const ifd_size = 2 + entry_count * 12 + 4;
  const bits_at = ifd + ifd_size;
  const x_resolution_at = bits_at + 8;
  const y_resolution_at = x_resolution_at + 8;
  const pixels_at = y_resolution_at + 8;
  const pixel_bytes = width * height * samples;
  if (pixels_at + pixel_bytes > MAX_BYTES) throw new Error("A TIFF can't be larger than 4 GB");

  const entries: Entry[] = [
    { tag: 256, type: LONG, count: 1, value: width },
    { tag: 257, type: LONG, count: 1, value: height },
    { tag: 258, type: SHORT, count: samples, value: bits_at },
    { tag: 259, type: SHORT, count: 1, value: 1 },
    { tag: 262, type: SHORT, count: 1, value: 2 },
    { tag: 273, type: LONG, count: 1, value: pixels_at },
    { tag: 277, type: SHORT, count: 1, value: samples },
    { tag: 278, type: LONG, count: 1, value: height },
    { tag: 279, type: LONG, count: 1, value: pixel_bytes },
    { tag: 282, type: RATIONAL, count: 1, value: x_resolution_at },
    { tag: 283, type: RATIONAL, count: 1, value: y_resolution_at },
    { tag: 284, type: SHORT, count: 1, value: 1 },
    { tag: 296, type: SHORT, count: 1, value: 2 },
    ...(alpha ? [{ tag: 338, type: SHORT, count: 1, value: 2 }] : []),
  ];

  const out = new Uint8Array(pixels_at + pixel_bytes);
  const view = new DataView(out.buffer);
  out.set([0x49, 0x49], 0);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifd, true);
  view.setUint16(ifd, entries.length, true);
  entries.forEach(({ tag, type, count, value }, index) => {
    const at = ifd + 2 + index * 12;
    view.setUint16(at, tag, true);
    view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count, true);
    if (type === SHORT && count === 1) view.setUint16(at + 8, value, true);
    else view.setUint32(at + 8, value, true);
  });
  view.setUint32(ifd + 2 + entries.length * 12, 0, true);
  for (let sample = 0; sample < samples; sample++) view.setUint16(bits_at + sample * 2, 8, true);
  for (const at of [x_resolution_at, y_resolution_at]) {
    view.setUint32(at, 72, true);
    view.setUint32(at + 4, 1, true);
  }
  if (alpha) out.set(data, pixels_at);
  else for (let source = 0, target = pixels_at; source < data.length; source += 4, target += 3) {
    out[target] = data[source];
    out[target + 1] = data[source + 1];
    out[target + 2] = data[source + 2];
  }
  return out;
}
