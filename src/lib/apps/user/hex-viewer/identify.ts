import { detect_format, FontFormat } from "$lib/apps/user/font-viewer/font";
import { concat, Signature, type Bytes } from "$lib/core/utils/zip/format";

export const Container = { ZIP: "zip", GZIP: "gzip", TAR: "tar" } as const;
export type Container = (typeof Container)[keyof typeof Container];

export interface Identity {
  type: string;
  details: string;
  container?: Container;
  /** Bytes a tar header and its data cover, so `--scan` can skip the archive's own later headers. */
  span?: number;
}

export interface Hit extends Identity {
  offset: number;
}

interface Input {
  bytes: Uint8Array;
  view: DataView;
}

interface Magic {
  bytes: number[];
  at?: number;
  /** `false` keeps it out of `--scan`: too short or too common to trust away from offset 0. */
  scan?: boolean;
  identify(input: Input, p: number): Identity | null;
}

const ascii = (text: string) => Array.from(text, (char) => char.charCodeAt(0));
const le32 = (value: number) => [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, value >>> 24];
const text_at = (bytes: Uint8Array, p: number, length: number) => String.fromCharCode(...bytes.subarray(p, p + length));
const join = (...parts: (string | number | null | undefined | false)[]) => parts.filter((part) => part || part === 0).join(", ");
const dims = (width: number, height: number) => `${width} × ${height}`;
const khz = (rate: number) => `${rate / 1000} kHz`;
const channels = (count: number) => (count === 1 ? "mono" : count === 2 ? "stereo" : `${count} channels`);
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
const u24le = (view: DataView, p: number) => view.getUint16(p, true) | (view.getUint8(p + 2) << 16);

function c_string(bytes: Uint8Array, p: number, max: number): string | null {
  const end = bytes.subarray(p, p + max).indexOf(0);
  return end > 0 ? new TextDecoder().decode(bytes.subarray(p, p + end)) : null;
}

const PNG_COLOURS: Record<number, string> = { 0: "grayscale", 2: "RGB", 3: "palette", 4: "grayscale + alpha", 6: "RGBA" };

const is_sof = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
const is_header_marker = (marker: number) => (marker >= 0xc0 && marker <= 0xcf) || (marker >= 0xdb && marker <= 0xef) || marker === 0xfe;

// Walks the header segments to the frame header. `null` when the chain breaks; "" when the buffer ends first, which
// counts only after a JFIF/Exif identifier or two well-formed segments: FF D8 FF turns up by chance in audio.
function jpeg_header({ bytes, view }: Input, p: number, identified: boolean): string | null {
  let q = p + 2;
  let segments = 0;
  while (q + 10 <= bytes.length) {
    const marker = bytes[q + 1];
    if (bytes[q] !== 0xff || !is_header_marker(marker)) return null;
    const length = view.getUint16(q + 2);
    if (is_sof(marker)) {
      const [precision, height, width, components] = [bytes[q + 4], view.getUint16(q + 5), view.getUint16(q + 7), bytes[q + 9]];
      const valid = (precision === 8 || precision === 12) && width > 0 && height > 0 && [1, 3, 4].includes(components) && length === 8 + 3 * components;
      return valid ? join(dims(width, height), marker === 0xc2 && "progressive") : null;
    }
    if (length < 2) return null;
    q += 2 + length;
    segments++;
  }
  return identified || segments >= 2 ? "" : null;
}

function webp(view: DataView, p: number): Identity | null {
  const chunk = String.fromCharCode(view.getUint8(p + 12), view.getUint8(p + 13), view.getUint8(p + 14), view.getUint8(p + 15));
  if (chunk === "VP8X") return { type: "WebP image", details: join(dims(1 + u24le(view, p + 24), 1 + u24le(view, p + 27)), "extended") };
  if (chunk === "VP8L" && view.getUint8(p + 20) === 0x2f) {
    const bits = view.getUint32(p + 21, true);
    return { type: "WebP image", details: join(dims((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1), "lossless") };
  }
  if (chunk === "VP8 ") {
    return { type: "WebP image", details: join(dims(view.getUint16(p + 26, true) & 0x3fff, view.getUint16(p + 28, true) & 0x3fff), "lossy") };
  }
  return null;
}

const WAVE_FORMATS: Record<number, string> = { 1: "PCM", 3: "float", 0xfffe: "extensible" };

function wave(input: Input, p: number): Identity {
  const { bytes, view } = input;
  if (text_at(bytes, p + 12, 4) !== "fmt ") return { type: "WAV audio", details: "" };
  const details = join(
    WAVE_FORMATS[view.getUint16(p + 20, true)],
    khz(view.getUint32(p + 24, true)),
    `${view.getUint16(p + 34, true)}-bit`,
    channels(view.getUint16(p + 22, true))
  );
  return { type: "WAV audio", details };
}

const BMP_HEADERS = new Set([12, 40, 52, 56, 64, 108, 124]);

const ZIP_METHODS = new Set([0, 8, 9, 12, 14, 93, 95, 98, 99]);
const ZIP_MIMETYPES: Record<string, string> = {
  "application/epub+zip": "EPUB ebook",
  "application/vnd.oasis.opendocument.text": "OpenDocument text",
  "application/vnd.oasis.opendocument.spreadsheet": "OpenDocument spreadsheet",
  "application/vnd.oasis.opendocument.presentation": "OpenDocument presentation",
  "application/vnd.oasis.opendocument.graphics": "OpenDocument drawing",
};

const ELF_TYPES: Record<number, string> = { 1: "relocatable", 2: "executable", 3: "shared object", 4: "core dump" };
const ELF_MACHINES: Record<number, string> = {
  0x03: "x86",
  0x08: "MIPS",
  0x14: "PowerPC",
  0x15: "PowerPC 64",
  0x28: "ARM",
  0x3e: "x86-64",
  0xb7: "AArch64",
  0xf3: "RISC-V",
};

const MACHO_CPUS: Record<number, string> = {
  7: "x86",
  0x01000007: "x86-64",
  12: "ARM",
  0x0100000c: "ARM64",
  0x0200000c: "ARM64_32",
  18: "PowerPC",
  0x01000012: "PowerPC 64",
};
const MACHO_TYPES: Record<number, string> = { 1: "object", 2: "executable", 6: "dynamic library", 7: "dynamic linker", 8: "bundle", 11: "kernel extension" };

function macho(bits: number, little: boolean): Magic["identify"] {
  return ({ view }, p) => {
    const cpu = MACHO_CPUS[view.getUint32(p + 4, little)];
    const kind = MACHO_TYPES[view.getUint32(p + 12, little)];
    return cpu && kind ? { type: `Mach-O ${kind}`, details: join(`${bits}-bit`, cpu) } : null;
  };
}

const PE_MACHINES: Record<number, string> = { 0x14c: "x86", 0x8664: "x86-64", 0xaa64: "ARM64", 0x1c0: "ARM", 0x1c4: "ARMv7" };
const PE_SUBSYSTEMS: Record<number, string> = { 1: "native", 2: "GUI", 3: "console", 10: "EFI application" };

const MP3_V1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MP3_V2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];

function mpeg_frame(view: DataView, p: number): string | null {
  const [b0, b1, b2, b3] = [view.getUint8(p), view.getUint8(p + 1), view.getUint8(p + 2), view.getUint8(p + 3)];
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 3;
  const layer = (b1 >> 1) & 3;
  const bitrate = b2 >> 4;
  const rate = (b2 >> 2) & 3;
  if (version === 1 || layer !== 1 || bitrate === 0 || bitrate === 15 || rate === 3) return null;
  const kbps = (version === 3 ? MP3_V1 : MP3_V2)[bitrate];
  const hz = [44100, 48000, 32000][rate] / (version === 3 ? 1 : version === 2 ? 2 : 4);
  return join(`${kbps} kbps`, khz(hz), b3 >> 6 === 3 ? "mono" : "stereo");
}

const MP4_BRANDS: Record<string, string> = {
  isom: "MP4 video",
  iso2: "MP4 video",
  mp41: "MP4 video",
  mp42: "MP4 video",
  avc1: "MP4 video",
  dash: "MP4 video",
  "M4V": "MP4 video",
  "M4A": "M4A audio",
  "M4B": "M4B audiobook",
  qt: "QuickTime video",
  heic: "HEIF image",
  heix: "HEIF image",
  mif1: "HEIF image",
  msf1: "HEIF image",
  avif: "AVIF image",
  avis: "AVIF image",
  "3gp4": "3GP video",
  "3gp5": "3GP video",
  "3g2a": "3GP video",
};

const FONT_FLAVOURS = new Set([0x00010000, 0x4f54544f, 0x74727565]);

function font_type(bytes: Uint8Array, p: number): string {
  const format = detect_format(bytes.subarray(p, p + 4));
  return format === FontFormat.COLLECTION ? "Font collection" : `${format} font`;
}

function woff({ bytes, view }: Input, p: number): Identity | null {
  if (!FONT_FLAVOURS.has(view.getUint32(p + 4)) || view.getUint32(p + 8) === 0) return null;
  return { type: font_type(bytes, p), details: plural(view.getUint16(p + 12), "table") };
}

// The binary-search fields all derive from the table count, which rules out chance matches of a 4-byte version.
function sfnt({ bytes, view }: Input, p: number): Identity | null {
  const tables = view.getUint16(p + 4);
  const power = Math.floor(Math.log2(tables));
  const range = 16 * 2 ** power;
  if (tables === 0 || tables > 64 || view.getUint16(p + 6) !== range || view.getUint16(p + 8) !== power || view.getUint16(p + 10) !== tables * 16 - range) {
    return null;
  }
  return { type: font_type(bytes, p), details: plural(tables, "table") };
}

function tar_header({ bytes, view }: Input, p: number): Identity | null {
  const terminator = view.getUint8(p + 262);
  if ((terminator !== 0 && terminator !== 0x20) || p + 512 > bytes.length) return null;
  let sum = 0;
  for (let index = 0; index < 512; index++) sum += index >= 148 && index < 156 ? 0x20 : bytes[p + index];
  const octal = (q: number, length: number) => parseInt(text_at(bytes, q, length).replace(/[\0 ]/g, ""), 8);
  if (octal(p + 148, 8) !== sum) return null;
  const size = octal(p + 124, 12) || 0;
  const name = c_string(bytes, p, 100);
  return { type: "tar archive", details: name ? `first entry ${name}` : "", container: Container.TAR, span: 512 + Math.ceil(size / 512) * 512 };
}

const MAGICS: Magic[] = [
  {
    bytes: [0x89, ...ascii("PNG\r\n\x1a\n")],
    identify: ({ bytes, view }, p) =>
      text_at(bytes, p + 12, 4) === "IHDR"
        ? {
            type: "PNG image",
            details: join(dims(view.getUint32(p + 16), view.getUint32(p + 20)), `${view.getUint8(p + 24)}-bit ${PNG_COLOURS[view.getUint8(p + 25)] ?? "colour"}`),
          }
        : null,
  },
  {
    bytes: [0xff, 0xd8, 0xff],
    identify(input, p) {
      const { bytes, view } = input;
      const marker = view.getUint8(p + 3);
      if (marker === 0xe0 && !["JFIF\0", "JFXX\0"].includes(text_at(bytes, p + 6, 5))) return null;
      if (marker === 0xe1 && text_at(bytes, p + 6, 5) !== "Exif\0" && text_at(bytes, p + 6, 4) !== "http") return null;
      const details = jpeg_header(input, p, marker === 0xe0 || marker === 0xe1);
      return details === null ? null : { type: "JPEG image", details };
    },
  },
  {
    bytes: ascii("GIF8"),
    identify: ({ bytes, view }, p) =>
      (bytes[p + 4] === 0x37 || bytes[p + 4] === 0x39) && bytes[p + 5] === 0x61
        ? { type: "GIF image", details: join(dims(view.getUint16(p + 6, true), view.getUint16(p + 8, true)), text_at(bytes, p, 6)) }
        : null,
  },
  {
    bytes: ascii("RIFF"),
    identify(input, p) {
      const form = text_at(input.bytes, p + 8, 4);
      if (form === "WEBP") return webp(input.view, p);
      if (form === "WAVE") return wave(input, p);
      if (form === "AVI ") return { type: "AVI video", details: "" };
      return /^[A-Za-z0-9 ]{4}$/.test(form) ? { type: "RIFF data", details: form.trim() } : null;
    },
  },
  {
    bytes: ascii("FORM"),
    identify({ bytes, view }, p) {
      const form = text_at(bytes, p + 8, 4);
      if (form !== "AIFF" && form !== "AIFC") return null;
      if (text_at(bytes, p + 12, 4) !== "COMM") return { type: "AIFF audio", details: "" };
      const exponent = (view.getUint16(p + 28) & 0x7fff) - 16383 - 31;
      const rate = Math.round(view.getUint32(p + 30) * 2 ** exponent);
      return { type: "AIFF audio", details: join(khz(rate), `${view.getUint16(p + 26)}-bit`, channels(view.getUint16(p + 20))) };
    },
  },
  {
    bytes: ascii("BM"),
    identify({ view }, p) {
      const header = view.getUint32(p + 14, true);
      if (view.getUint32(p + 6, true) !== 0 || !BMP_HEADERS.has(header) || view.getUint32(p + 10, true) < 14 + header) return null;
      const [width, height, depth] =
        header === 12
          ? [view.getUint16(p + 18, true), view.getUint16(p + 20, true), view.getUint16(p + 24, true)]
          : [view.getInt32(p + 18, true), Math.abs(view.getInt32(p + 22, true)), view.getUint16(p + 28, true)];
      if (width <= 0 || height === 0 || ![1, 2, 4, 8, 16, 24, 32].includes(depth)) return null;
      return { type: "BMP image", details: join(dims(width, height), `${depth}-bit`) };
    },
  },
  {
    bytes: [0, 0, 1, 0],
    scan: false,
    identify({ view }, p) {
      const count = view.getUint16(p + 4, true);
      if (count === 0 || view.getUint8(p + 9) !== 0 || view.getUint16(p + 10, true) > 1) return null;
      const side = (byte: number) => byte || 256;
      return { type: "ICO icon", details: join(plural(count, "image"), dims(side(view.getUint8(p + 6)), side(view.getUint8(p + 7)))) };
    },
  },
  {
    bytes: ascii("icns"),
    scan: false,
    identify: ({ view }, p) => (view.getUint32(p + 4) > 8 ? { type: "Apple icon image", details: "" } : null),
  },
  { bytes: ascii("bplist0"), identify: () => ({ type: "Binary property list", details: "" }) },
  { bytes: ascii("II*\0"), scan: false, identify: () => ({ type: "TIFF image", details: "little-endian" }) },
  { bytes: ascii("MM\0*"), scan: false, identify: () => ({ type: "TIFF image", details: "big-endian" }) },
  {
    bytes: ascii("%PDF-"),
    identify: ({ bytes }, p) => {
      const version = /^\d\.\d/.exec(text_at(bytes, p + 5, 3));
      return version ? { type: "PDF document", details: `version ${version[0]}` } : null;
    },
  },
  {
    bytes: le32(Signature.LOCAL),
    identify({ bytes, view }, p) {
      const method = view.getUint16(p + 8, true);
      const name_length = view.getUint16(p + 26, true);
      if (view.getUint16(p + 4, true) > 63 || !ZIP_METHODS.has(method) || name_length === 0 || name_length > 1024) return null;
      const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + name_length));
      if (name === "mimetype" && method === 0) {
        const start = p + 30 + name_length + view.getUint16(p + 28, true);
        const type = ZIP_MIMETYPES[text_at(bytes, start, Math.min(100, view.getUint32(p + 18, true))).trim()];
        if (type) return { type, details: "", container: Container.ZIP };
      }
      return { type: "Zip archive", details: `first entry ${name}`, container: Container.ZIP };
    },
  },
  { bytes: le32(Signature.END), scan: false, identify: () => ({ type: "Zip archive", details: "empty" }) },
  {
    bytes: [0x1f, 0x8b, 0x08],
    identify({ bytes, view }, p) {
      const flags = view.getUint8(p + 3);
      const os = view.getUint8(p + 9);
      if (flags & 0xe0 || ![0, 2, 4].includes(view.getUint8(p + 8)) || (os > 13 && os !== 255)) return null;
      const start = p + 10 + (flags & 0x04 ? 2 + view.getUint16(p + 10, true) : 0);
      const name = flags & 0x08 ? c_string(bytes, start, 256) : null;
      return { type: "gzip compressed data", details: name ? `was ${name}` : "", container: Container.GZIP };
    },
  },
  {
    bytes: ascii("BZh"),
    identify: ({ bytes }, p) =>
      bytes[p + 3] >= 0x31 && bytes[p + 3] <= 0x39 && ["1AY&SY", "\x17rE8P\x90"].includes(text_at(bytes, p + 4, 6))
        ? { type: "bzip2 compressed data", details: `${String.fromCharCode(bytes[p + 3])}00k blocks` }
        : null,
  },
  { bytes: [0xfd, ...ascii("7zXZ"), 0], identify: () => ({ type: "xz compressed data", details: "" }) },
  {
    bytes: [0x28, 0xb5, 0x2f, 0xfd],
    identify: ({ view }, p) => (view.getUint8(p + 4) & 0x08 ? null : { type: "Zstandard compressed data", details: "" }),
  },
  {
    bytes: [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c],
    identify: ({ view }, p) => (view.getUint8(p + 6) === 0 ? { type: "7-Zip archive", details: `version 0.${view.getUint8(p + 7)}` } : null),
  },
  {
    bytes: ascii("Rar!\x1a\x07"),
    identify({ view }, p) {
      if (view.getUint8(p + 6) === 0) return { type: "RAR archive", details: "version 4" };
      return view.getUint8(p + 6) === 1 && view.getUint8(p + 7) === 0 ? { type: "RAR archive", details: "version 5" } : null;
    },
  },
  { bytes: ascii("ustar"), at: 257, identify: tar_header },
  {
    bytes: ascii("CD001"),
    at: 0x8001,
    scan: false,
    identify: ({ bytes }, p) => ({ type: "ISO 9660 disc image", details: text_at(bytes, p + 0x8028, 32).trim() }),
  },
  {
    bytes: [0x7f, ...ascii("ELF")],
    identify({ view }, p) {
      const bits = view.getUint8(p + 4);
      const data = view.getUint8(p + 5);
      if (bits < 1 || bits > 2 || data < 1 || data > 2 || view.getUint8(p + 6) !== 1) return null;
      const little = data === 1;
      const kind = ELF_TYPES[view.getUint16(p + 16, little)];
      if (!kind) return null;
      const machine = view.getUint16(p + 18, little);
      return {
        type: `ELF ${kind}`,
        details: join(bits === 2 ? "64-bit" : "32-bit", ELF_MACHINES[machine] ?? `machine ${machine}`, little ? "little-endian" : "big-endian"),
      };
    },
  },
  { bytes: [0xfe, 0xed, 0xfa, 0xce], identify: macho(32, false) },
  { bytes: [0xfe, 0xed, 0xfa, 0xcf], identify: macho(64, false) },
  { bytes: [0xce, 0xfa, 0xed, 0xfe], identify: macho(32, true) },
  { bytes: [0xcf, 0xfa, 0xed, 0xfe], identify: macho(64, true) },
  {
    // Shared by fat Mach-O binaries and Java classes: a fat binary has a handful of architectures, a class a version >= 45.
    bytes: [0xca, 0xfe, 0xba, 0xbe],
    scan: false,
    identify({ view }, p) {
      const count = view.getUint32(p + 4);
      if (count > 0 && count < 20) return { type: "Mach-O universal binary", details: plural(count, "architecture") };
      const major = view.getUint16(p + 6);
      return major >= 45 && major < 100 ? { type: "Java class", details: `class version ${major}` } : null;
    },
  },
  {
    bytes: ascii("MZ"),
    identify({ view }, p) {
      const header = view.getUint32(p + 0x3c, true);
      if (header < 0x40 || header > 0x1000 || view.getUint32(p + header) !== 0x50450000) return null;
      const q = p + header;
      const optional = view.getUint16(q + 24, true);
      if (optional !== 0x10b && optional !== 0x20b) return null;
      const machine = view.getUint16(q + 4, true);
      const dll = view.getUint16(q + 22, true) & 0x2000;
      return {
        type: `${optional === 0x20b ? "PE32+" : "PE32"} ${dll ? "DLL" : "executable"}`,
        details: join(PE_MACHINES[machine] ?? `machine 0x${machine.toString(16)}`, PE_SUBSYSTEMS[view.getUint16(q + 24 + 68, true)]),
      };
    },
  },
  {
    bytes: [0, ...ascii("asm")],
    identify: ({ view }, p) => (view.getUint32(p + 4, true) === 1 ? { type: "WebAssembly module", details: "version 1" } : null),
  },
  {
    bytes: ascii("SQLite format 3\0"),
    identify({ view }, p) {
      const page = view.getUint16(p + 16);
      const size = page === 1 ? 65536 : page;
      return size >= 512 && (size & (size - 1)) === 0 ? { type: "SQLite 3 database", details: `${size}-byte pages` } : null;
    },
  },
  {
    bytes: ascii("ID3"),
    identify({ view }, p) {
      const version = view.getUint8(p + 3);
      const sizes = [6, 7, 8, 9].map((index) => view.getUint8(p + index));
      if (version < 2 || version > 4 || view.getUint8(p + 4) === 0xff || view.getUint8(p + 5) & 0x0f || sizes.some((byte) => byte >= 0x80)) return null;
      const size = sizes.reduce((total, byte) => (total << 7) | byte, 0);
      let frame: string | null = null;
      try {
        frame = mpeg_frame(view, p + 10 + size);
      } catch {
        frame = null;
      }
      return { type: frame ? "MP3 audio" : "Audio with ID3 tag", details: join(`ID3v2.${version}`, frame) };
    },
  },
  {
    bytes: [0xff],
    scan: false,
    identify: ({ view }, p) => {
      const frame = mpeg_frame(view, p);
      return frame ? { type: "MP3 audio", details: frame } : null;
    },
  },
  {
    bytes: ascii("ftyp"),
    at: 4,
    identify({ bytes, view }, p) {
      const size = view.getUint32(p);
      const brand = text_at(bytes, p + 8, 4);
      if (size < 16 || size > 512 || size % 4 || !/^[\x20-\x7e]{4}$/.test(brand)) return null;
      return { type: MP4_BRANDS[brand.trim()] ?? "ISO media", details: `brand ${brand.trim()}` };
    },
  },
  {
    bytes: [0x1a, 0x45, 0xdf, 0xa3],
    identify({ bytes }, p) {
      const header = text_at(bytes, p, 64);
      if (header.includes("webm")) return { type: "WebM video", details: "" };
      return header.includes("matroska") ? { type: "Matroska video", details: "" } : null;
    },
  },
  {
    bytes: ascii("OggS"),
    identify({ bytes, view }, p) {
      // Only the first page of a stream: every later page carries the same magic.
      if (view.getUint8(p + 4) !== 0 || !(view.getUint8(p + 5) & 0x02) || view.getUint8(p + 5) > 7) return null;
      const q = p + 27 + view.getUint8(p + 26);
      if (view.getUint8(q) === 1 && text_at(bytes, q + 1, 6) === "vorbis") {
        return { type: "Ogg Vorbis audio", details: join(khz(view.getUint32(q + 12, true)), channels(view.getUint8(q + 11))) };
      }
      if (text_at(bytes, q, 8) === "OpusHead") return { type: "Ogg Opus audio", details: channels(view.getUint8(q + 9)) };
      if (view.getUint8(q) === 0x80 && text_at(bytes, q + 1, 6) === "theora") return { type: "Ogg Theora video", details: "" };
      if (text_at(bytes, q, 5) === "\x7fFLAC") return { type: "Ogg FLAC audio", details: "" };
      return { type: "Ogg data", details: "" };
    },
  },
  {
    bytes: ascii("fLaC"),
    identify({ view }, p) {
      if ((view.getUint8(p + 4) & 0x7f) !== 0 || view.getUint16(p + 5) !== 0 || view.getUint8(p + 7) !== 34) return null;
      const [a, b, c, d] = [18, 19, 20, 21].map((index) => view.getUint8(p + index));
      const rate = (a << 12) | (b << 4) | (c >> 4);
      const depth = (((c & 1) << 4) | (d >> 4)) + 1;
      return { type: "FLAC audio", details: join(khz(rate), `${depth}-bit`, channels(((c >> 1) & 7) + 1)) };
    },
  },
  { bytes: ascii("wOFF"), identify: woff },
  { bytes: ascii("wOF2"), identify: woff },
  { bytes: ascii("OTTO"), identify: sfnt },
  { bytes: [0, 1, 0, 0], identify: sfnt },
  { bytes: ascii("true"), identify: sfnt },
  {
    bytes: ascii("ttcf"),
    identify({ bytes, view }, p) {
      const version = view.getUint32(p + 4);
      const count = view.getUint32(p + 8);
      if ((version !== 0x00010000 && version !== 0x00020000) || count === 0 || count > 256) return null;
      return { type: font_type(bytes, p), details: plural(count, "font") };
    },
  },
];

function input_of(bytes: Uint8Array): Input {
  return { bytes, view: new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength) };
}

function has_magic(bytes: Uint8Array, at: number, magic: number[]): boolean {
  if (at < 0 || at + magic.length > bytes.length) return false;
  for (let index = 0; index < magic.length; index++) if (bytes[at + index] !== magic[index]) return false;
  return true;
}

// A header cut off by the end of the buffer reads past it; that's no match rather than an error.
function attempt(magic: Magic, input: Input, p: number): Identity | null {
  try {
    return magic.identify(input, p);
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

export function sniff(bytes: Uint8Array): Identity | null {
  const input = input_of(bytes);
  for (const magic of MAGICS) {
    if (!has_magic(bytes, magic.at ?? 0, magic.bytes)) continue;
    const found = attempt(magic, input, 0);
    if (found) return found;
  }
  return null;
}

const BOMS = [
  { bytes: [0xef, 0xbb, 0xbf], encoding: "utf-8", label: "UTF-8" },
  { bytes: [0xff, 0xfe], encoding: "utf-16le", label: "UTF-16 LE" },
  { bytes: [0xfe, 0xff], encoding: "utf-16be", label: "UTF-16 BE" },
];

function decode(bytes: Uint8Array, encoding: string, complete: boolean): string | null {
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes, { stream: !complete });
  } catch {
    return null;
  }
}

function control_ratio(text: string): number {
  if (!text.length) return 0;
  let count = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if ((code < 0x20 && (code < 0x09 || code > 0x0d) && code !== 0x1b) || code === 0x7f) count++;
  }
  return count / text.length;
}

function line_breaks(text: string): { crlf: number; lf: number; cr: number } {
  const counts = { crlf: 0, lf: 0, cr: 0 };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "\r" && text[index + 1] === "\n") {
      counts.crlf++;
      index++;
    } else if (char === "\n") counts.lf++;
    else if (char === "\r") counts.cr++;
  }
  return counts;
}

function endings({ crlf, lf, cr }: { crlf: number; lf: number; cr: number }): string {
  const kinds = [crlf && "CRLF", lf && "LF", cr && "CR"].filter(Boolean);
  if (kinds.length === 0) return "no line breaks";
  return kinds.length === 1 ? `${kinds[0]} line endings` : "mixed line endings";
}

function text_format(text: string, complete: boolean): string | null {
  if (text.startsWith("#!")) {
    const words = text.slice(2, text.search(/\r|\n|$/)).trim().split(/\s+/);
    const program = (word: string | undefined) => word?.slice(word.lastIndexOf("/") + 1) ?? "";
    const name = program(words[0]) === "env" ? program(words.slice(1).find((word) => !word.startsWith("-"))) : program(words[0]);
    return name ? `${name} script` : "script";
  }
  if (/^<\?xml/.test(text)) return /<svg[\s>]/.test(text) ? "SVG image" : "XML document";
  if (/^<svg[\s>]/i.test(text)) return "SVG image";
  if (/^(<!doctype html|<html[\s>])/i.test(text)) return "HTML document";
  if (/^[{[]/.test(text)) {
    if (!complete) return /^(\{\s*"|\[\s*[[{"\d\-\]])/.test(text) ? "JSON data" : null;
    try {
      JSON.parse(text);
      return "JSON data";
    } catch {
      return null;
    }
  }
  return null;
}

export function describe_text(bytes: Uint8Array, complete: boolean): Identity | null {
  const bom = BOMS.find((candidate) => has_magic(bytes, 0, candidate.bytes));
  const body = bom ? bytes.subarray(bom.bytes.length) : bytes;
  let text: string | null;
  let charset: string;
  if (bom) {
    text = decode(body, bom.encoding, complete);
    charset = bom.label;
  } else {
    if (body.includes(0)) return null;
    text = decode(body, "utf-8", complete);
    charset = body.every((byte) => byte < 0x80) ? "ASCII" : "UTF-8";
    if (text === null) {
      text = decode(body, "windows-1252", complete);
      charset = body.some((byte) => byte >= 0x80 && byte < 0xa0) ? "Extended ASCII" : "ISO-8859";
    }
  }
  if (text === null || control_ratio(text) > 0.01) return null;

  const format = text_format(text.trimStart(), complete);
  const breaks = line_breaks(text);
  const lines = breaks.crlf + breaks.lf + breaks.cr + (text && !/[\r\n]$/.test(text) ? 1 : 0);
  return {
    type: format ?? `${charset} text`,
    details: join(format && charset, bom && "with BOM", endings(breaks), complete && plural(lines, "line")),
  };
}

export function identify(head: Uint8Array, size: number): Identity {
  if (size === 0) return { type: "empty", details: "" };
  return sniff(head) ?? describe_text(head, head.length >= size) ?? { type: "data", details: "" };
}

const ZIP_NAMES: [string[], string][] = [
  [["word/document.xml"], "Word document (docx)"],
  [["xl/workbook.xml"], "Excel spreadsheet (xlsx)"],
  [["ppt/presentation.xml"], "PowerPoint presentation (pptx)"],
  [["AndroidManifest.xml", "classes.dex"], "Android package (apk)"],
  [["META-INF/MANIFEST.MF"], "Java archive (jar)"],
  [["[Content_Types].xml"], "Office Open XML document"],
];

export function zip_identity(names: string[], base: Identity): Identity {
  const set = new Set(names);
  const kind = base.type === "Zip archive" ? ZIP_NAMES.find(([needed]) => needed.every((name) => set.has(name)))?.[1] : undefined;
  const count = names.filter((name) => !name.endsWith("/")).length;
  return { ...base, type: kind ?? base.type, details: plural(count, "file") };
}

export async function gunzip_head(head: Bytes, limit = 1024): Promise<Bytes | null> {
  const reader = new Blob([head]).stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks: Bytes[] = [];
  let total = 0;
  try {
    while (total < limit) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
  } catch {
    // A head cut off mid-stream errors at its end; what came out before still counts.
  }
  reader.cancel().catch(() => {});
  return total ? concat(chunks) : null;
}

export function gzip_identity(inner: Uint8Array | null, base: Identity): Identity {
  const found = inner && (sniff(inner) ?? describe_text(inner, false));
  if (!found) return base;
  if (found.container === Container.TAR) return { type: "gzip compressed tar archive", details: join(base.details, found.details) };
  return { ...base, details: join(base.details, `holds ${found.type}`) };
}

export function count_bytes(counts: Float64Array, bytes: Uint8Array): void {
  for (let index = 0; index < bytes.length; index++) counts[bytes[index]]++;
}

export function entropy(counts: Float64Array): number {
  let total = 0;
  for (const count of counts) total += count;
  if (!total) return 0;
  let bits = 0;
  for (const count of counts) if (count) bits -= (count / total) * Math.log2(count / total);
  return bits;
}

export function with_entropy(identity: Identity, bits: number): Identity {
  if (identity.type !== "data" || bits < 7.9) return identity;
  return { ...identity, details: join(identity.details, "looks compressed or encrypted") };
}

export interface ScanState {
  in_zip: boolean;
  tar_next: number;
}

export const scan_state = (): ScanState => ({ in_zip: false, tar_next: -1 });

const SCAN_GROUPS = (() => {
  const groups = new Map<number, Magic[][]>();
  for (const magic of MAGICS) {
    if (magic.scan === false) continue;
    const at = magic.at ?? 0;
    const by_byte = groups.get(at) ?? Array.from({ length: 256 }, (): Magic[] => []);
    by_byte[magic.bytes[0]].push(magic);
    groups.set(at, by_byte);
  }
  return [...groups].map(([at, by_byte]) => ({ at, by_byte }));
})();

// Offset 0 is the file itself: it only seeds the state. A zip's own entries and a tar's later headers aren't listed.
export function scan(bytes: Uint8Array, base: number, length: number, state: ScanState): Hit[] {
  const input = input_of(bytes);
  const hits: Hit[] = [];
  for (let index = 0; index < length; index++) {
    const offset = base + index;
    if (state.in_zip && bytes[index] === 0x50 && index + 4 <= bytes.length && input.view.getUint32(index, true) === Signature.END) state.in_zip = false;
    for (const { at, by_byte } of SCAN_GROUPS) {
      let identity: Identity | null = null;
      for (const magic of by_byte[bytes[index + at]] ?? []) {
        if (has_magic(bytes, index + at, magic.bytes)) identity = attempt(magic, input, index);
        if (identity) break;
      }
      if (!identity) continue;
      let listed = offset > 0;
      if (identity.container === Container.ZIP) {
        if (state.in_zip) listed = false;
        state.in_zip = true;
      }
      if (identity.container === Container.TAR) {
        if (offset === state.tar_next) listed = false;
        state.tar_next = offset + (identity.span ?? 512);
      }
      if (listed) hits.push({ offset, type: identity.type, details: identity.details });
      break;
    }
  }
  return hits;
}
