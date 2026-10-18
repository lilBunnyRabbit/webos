import { has_prefix, image_kind, jpeg_segments, png_chunks, webp_chunks, type Block } from "./containers";
import { gps_position, read_tiff } from "./tiff";
import { ImageKind, type ExifTags, type Metadata } from "./type";

export const EXIF_HEADER = "Exif\0\0";
export const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const XMP_EXTENSION = "http://ns.adobe.com/xmp/extension/\0";
const PNG_XMP_KEY = "XML:com.adobe.xmp";

const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder();

const PNG_COLOUR: Readonly<Record<number, string>> = {
  0: "Greyscale",
  2: "RGB",
  3: "Indexed",
  4: "Greyscale + alpha",
  6: "RGBA",
};

function view_of(data: Uint8Array): DataView {
  return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function null_at(data: Uint8Array, from = 0): number {
  const index = data.indexOf(0, from);
  return index === -1 ? data.length : index;
}

function empty(format: Metadata["format"]): Metadata {
  return { format, width: null, height: null, orientation: 1, exif: {}, gps: null, text: [], details: {}, xmp: null, blocks: [] };
}

function block(metadata: Metadata, kind: string, item: Block) {
  metadata.blocks.push({ kind, offset: item.start, length: item.end - item.start });
}

function apply_exif(metadata: Metadata, tiff: Uint8Array) {
  const tags = read_tiff(tiff);
  if (!tags) return;
  Object.assign(metadata.exif, tags);
  metadata.gps = gps_position(metadata.exif);
  metadata.orientation = orientation_of(metadata.exif);
}

function orientation_of(tags: ExifTags): number {
  const value = tags.Orientation;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 8 ? value : 1;
}

function is_frame_header(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
}

function read_jpeg(bytes: Uint8Array): Metadata {
  const metadata = empty(ImageKind.JPEG);
  for (const segment of jpeg_segments(bytes)) {
    const { marker, data } = segment;
    if (is_frame_header(marker) && data.length >= 6) {
      const view = view_of(data);
      metadata.height = view.getUint16(1);
      metadata.width = view.getUint16(3);
      metadata.details["Bit depth"] = data[0];
      metadata.details.Components = data[5];
      metadata.details.Encoding = marker === 0xc2 || marker === 0xc6 ? "Progressive" : "Baseline";
    } else if (marker === 0xe0 && has_prefix(data, "JFIF\0") && data.length >= 12) {
      const view = view_of(data);
      const [x, y] = [view.getUint16(8), view.getUint16(10)];
      if (data[7] === 1 && x > 0) metadata.details.Resolution = x === y ? `${x} dpi` : `${x} × ${y} dpi`;
    } else if (marker === 0xe1 && has_prefix(data, EXIF_HEADER)) {
      block(metadata, "APP1 EXIF", segment);
      apply_exif(metadata, data.subarray(EXIF_HEADER.length));
    } else if (marker === 0xe1 && has_prefix(data, XMP_HEADER)) {
      block(metadata, "APP1 XMP", segment);
      metadata.xmp = utf8.decode(data.subarray(XMP_HEADER.length));
    } else if (marker === 0xe1 && has_prefix(data, XMP_EXTENSION)) {
      block(metadata, "APP1 XMP extension", segment);
    } else if (marker === 0xe2 && has_prefix(data, "ICC_PROFILE\0")) {
      block(metadata, "APP2 ICC", segment);
      metadata.details["ICC profile"] = "Embedded";
    } else if (marker === 0xed) {
      block(metadata, "APP13 IPTC", segment);
    } else if (marker === 0xfe) {
      block(metadata, "COM", segment);
      const comment = utf8.decode(data).replace(/\0+$/, "").trim();
      if (comment) metadata.text.push({ key: "Comment", value: comment });
    } else if (marker >= 0xe1 && marker <= 0xef) {
      const name = latin1.decode(data.subarray(0, null_at(data.subarray(0, 32))));
      block(metadata, `APP${marker - 0xe0}${name ? ` ${name}` : ""}`, segment);
    }
  }
  return metadata;
}

function read_png_text(type: string, data: Uint8Array): { key: string; value: string } {
  const split = null_at(data);
  const key = latin1.decode(data.subarray(0, split));
  if (type === "tEXt") return { key, value: latin1.decode(data.subarray(split + 1)) };
  if (type === "zTXt") return { key, value: `Compressed, ${data.length - split - 2} bytes` };
  const compressed = data[split + 1] === 1;
  const language_end = null_at(data, split + 3);
  const translated_end = null_at(data, language_end + 1);
  const body = data.subarray(translated_end + 1);
  return { key, value: compressed ? `Compressed, ${body.length} bytes` : utf8.decode(body) };
}

function read_png(bytes: Uint8Array): Metadata {
  const metadata = empty(ImageKind.PNG);
  for (const chunk of png_chunks(bytes)) {
    const { type, data } = chunk;
    const view = view_of(data);
    if (type === "IHDR" && data.length >= 13) {
      metadata.width = view.getUint32(0);
      metadata.height = view.getUint32(4);
      metadata.details["Bit depth"] = data[8];
      metadata.details["Colour type"] = PNG_COLOUR[data[9]] ?? String(data[9]);
      if (data[12] === 1) metadata.details.Interlaced = "Adam7";
    } else if (type === "pHYs" && data.length >= 9) {
      const [x, y] = [view.getUint32(0), view.getUint32(4)];
      if (data[8] === 1) {
        const [dx, dy] = [Math.round(x * 0.0254), Math.round(y * 0.0254)];
        metadata.details.Resolution = dx === dy ? `${dx} dpi` : `${dx} × ${dy} dpi`;
      } else if (x !== y) metadata.details["Pixel aspect"] = `${x}:${y}`;
    } else if (type === "tIME" && data.length >= 7) {
      block(metadata, type, chunk);
      metadata.details.Modified = `${pad(view.getUint16(0), 4)}-${pad(data[2])}-${pad(data[3])} ${pad(data[4])}:${pad(data[5])}:${pad(data[6])}`;
    } else if (type === "sRGB") {
      metadata.details["Colour space"] = "sRGB";
    } else if (type === "gAMA" && data.length >= 4) {
      metadata.details.Gamma = view.getUint32(0) / 100000;
    } else if (type === "iCCP") {
      block(metadata, type, chunk);
      metadata.details["ICC profile"] = latin1.decode(data.subarray(0, null_at(data))) || "Embedded";
    } else if (type === "acTL" && data.length >= 8) {
      metadata.details.Animated = `${view.getUint32(0)} frames`;
    } else if (type === "eXIf") {
      block(metadata, type, chunk);
      apply_exif(metadata, data);
    } else if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      block(metadata, type, chunk);
      const entry = read_png_text(type, data);
      if (entry.key === PNG_XMP_KEY) metadata.xmp = entry.value;
      else metadata.text.push(entry);
    }
  }
  return metadata;
}

function uint24(data: Uint8Array, at: number): number {
  return data[at] | (data[at + 1] << 8) | (data[at + 2] << 16);
}

function read_webp(bytes: Uint8Array): Metadata {
  const metadata = empty(ImageKind.WEBP);
  let frames = 0;
  for (const chunk of webp_chunks(bytes)) {
    const { type, data } = chunk;
    if (type === "VP8X" && data.length >= 10) {
      metadata.width = uint24(data, 4) + 1;
      metadata.height = uint24(data, 7) + 1;
      if (data[0] & 0x10) metadata.details.Alpha = "Yes";
    } else if (type === "VP8 " && data.length >= 10) {
      metadata.width ??= (data[6] | (data[7] << 8)) & 0x3fff;
      metadata.height ??= (data[8] | (data[9] << 8)) & 0x3fff;
      metadata.details.Encoding ??= "Lossy";
    } else if (type === "VP8L" && data.length >= 5 && data[0] === 0x2f) {
      const bits = data[1] | (data[2] << 8) | (data[3] << 16) | (data[4] << 24);
      metadata.width ??= (bits & 0x3fff) + 1;
      metadata.height ??= ((bits >>> 14) & 0x3fff) + 1;
      metadata.details.Encoding ??= "Lossless";
    } else if (type === "ANMF") {
      frames++;
    } else if (type === "ICCP") {
      block(metadata, type, chunk);
      metadata.details["ICC profile"] = "Embedded";
    } else if (type === "EXIF") {
      block(metadata, type, chunk);
      apply_exif(metadata, has_prefix(data, EXIF_HEADER) ? data.subarray(EXIF_HEADER.length) : data);
    } else if (type === "XMP ") {
      block(metadata, "XMP", chunk);
      metadata.xmp = utf8.decode(data);
    }
  }
  if (frames > 0) metadata.details.Animated = `${frames} frames`;
  return metadata;
}

export function read_metadata(bytes: Uint8Array): Metadata {
  const kind = image_kind(bytes);
  if (kind === ImageKind.JPEG) return read_jpeg(bytes);
  if (kind === ImageKind.PNG) return read_png(bytes);
  if (kind === ImageKind.WEBP) return read_webp(bytes);
  return empty(null);
}

function exif_block(bytes: Uint8Array): Uint8Array | null {
  const kind = image_kind(bytes);
  if (kind === ImageKind.JPEG) {
    const segment = jpeg_segments(bytes).find((item) => item.marker === 0xe1 && has_prefix(item.data, EXIF_HEADER));
    return segment ? segment.data.subarray(EXIF_HEADER.length) : null;
  }
  if (kind === ImageKind.PNG) return png_chunks(bytes).find((item) => item.type === "eXIf")?.data ?? null;
  if (kind === ImageKind.WEBP) {
    const data = webp_chunks(bytes).find((item) => item.type === "EXIF")?.data;
    if (!data) return null;
    return has_prefix(data, EXIF_HEADER) ? data.subarray(EXIF_HEADER.length) : data;
  }
  return null;
}

export function orientation(bytes: Uint8Array): number {
  const tiff = exif_block(bytes);
  return orientation_of((tiff && read_tiff(tiff)) || {});
}
