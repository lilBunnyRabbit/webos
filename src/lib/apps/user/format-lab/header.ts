import { is_avif, is_jxl } from "$kit/utils/codecs/formats";

export interface ImageHeader {
  format: "AVIF" | "JPEG XL";
  width: number | null;
  height: number | null;
  bit_depth: number | null;
  float: boolean;
  alpha: boolean | null;
  animated: boolean | null;
  hdr: boolean | null;
  colour: string | null;
  extra: { label: string; value: string }[];
}

const TRANSFER: Record<number, string> = { 1: "BT.709", 8: "linear", 13: "sRGB", 16: "PQ", 17: "DCI", 18: "HLG" };
const AVIF_PRIMARIES: Record<number, string> = { 1: "BT.709", 2: "unspecified", 9: "BT.2020", 12: "Display P3" };
const AVIF_TRANSFER: Record<number, string> = { 1: "BT.709", 2: "unspecified", 8: "linear", 13: "sRGB", 16: "PQ", 18: "HLG" };
const JXL_PRIMARIES: Record<number, string> = { 1: "sRGB", 2: "custom", 9: "BT.2020", 11: "P3" };
const HDR_TRANSFERS = new Set([16, 18]);

const ALPHA_URNS = new Set(["urn:mpeg:mpegB:cicp:systems:auxiliary:alpha", "urn:mpeg:hevc:2015:auxid:1"]);

export function parse_header(bytes: Uint8Array): ImageHeader | null {
  try {
    if (is_avif(bytes)) return parse_avif(bytes);
    if (is_jxl(bytes)) return parse_jxl(bytes);
  } catch {
    return null;
  }
  return null;
}

interface Box {
  type: string;
  start: number;
  end: number;
}

const four_cc = (bytes: Uint8Array, at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);

function u32(bytes: Uint8Array, at: number): number {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

const u16 = (bytes: Uint8Array, at: number) => (bytes[at] << 8) | bytes[at + 1];

function boxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const found: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = u32(bytes, at);
    const type = four_cc(bytes, at + 4);
    let header = 8;
    if (size === 1) {
      size = u32(bytes, at + 8) * 2 ** 32 + u32(bytes, at + 12);
      header = 16;
    } else if (size === 0) {
      size = end - at;
    }
    if (size < header) break;
    found.push({ type, start: at + header, end: Math.min(end, at + size) });
    at += size;
  }
  return found;
}

const child = (list: Box[], type: string) => list.find((box) => box.type === type);

function parse_avif(bytes: Uint8Array): ImageHeader {
  const header: ImageHeader = {
    format: "AVIF",
    width: null,
    height: null,
    bit_depth: null,
    float: false,
    alpha: false,
    animated: false,
    hdr: false,
    colour: null,
    extra: [],
  };
  const top = boxes(bytes, 0, bytes.length);
  const ftyp = child(top, "ftyp");
  if (ftyp) {
    const brands = [four_cc(bytes, ftyp.start)];
    for (let at = ftyp.start + 8; at + 4 <= ftyp.end; at += 4) brands.push(four_cc(bytes, at));
    header.animated = brands.includes("avis") || Boolean(child(top, "moov"));
    header.extra.push({ label: "Brand", value: brands[0] });
  }
  const meta = child(top, "meta");
  if (!meta) return header;
  const in_meta = boxes(bytes, meta.start + 4, meta.end);
  const pitm = child(in_meta, "pitm");
  const primary = pitm ? (bytes[pitm.start] === 0 ? u16(bytes, pitm.start + 4) : u32(bytes, pitm.start + 4)) : null;
  const iprp = child(in_meta, "iprp");
  if (!iprp) return header;
  const in_iprp = boxes(bytes, iprp.start, iprp.end);
  const ipco = child(in_iprp, "ipco");
  if (!ipco) return header;
  const properties = boxes(bytes, ipco.start, ipco.end);

  header.alpha = properties.some((box) => {
    if (box.type !== "auxC") return false;
    const text = bytes.subarray(box.start + 4, box.end);
    const urn = new TextDecoder().decode(text.subarray(0, Math.max(0, text.indexOf(0)) || text.length));
    return ALPHA_URNS.has(urn);
  });

  const own = primary === null ? properties : primary_properties(bytes, in_iprp, properties, primary);
  const ispe = child(own, "ispe");
  if (ispe) {
    header.width = u32(bytes, ispe.start + 4);
    header.height = u32(bytes, ispe.start + 8);
  }
  const pixi = child(own, "pixi");
  if (pixi && bytes[pixi.start + 4] > 0) header.bit_depth = bytes[pixi.start + 5];
  const av1c = child(own, "av1C");
  if (av1c) {
    const profile = bytes[av1c.start + 1] >> 5;
    const flags = bytes[av1c.start + 2];
    const high = (flags & 0x40) !== 0;
    const twelve = (flags & 0x20) !== 0;
    header.bit_depth ??= high ? (twelve ? 12 : 10) : 8;
    const mono = (flags & 0x10) !== 0;
    const sub_x = (flags & 0x08) !== 0;
    const sub_y = (flags & 0x04) !== 0;
    const chroma = mono ? "4:0:0 (grey)" : sub_x && sub_y ? "4:2:0" : sub_x ? "4:2:2" : "4:4:4";
    header.extra.push({ label: "Chroma", value: chroma });
    header.extra.push({ label: "AV1 profile", value: ["Main", "High", "Professional"][profile] ?? String(profile) });
  }
  const colr = own.find((box) => box.type === "colr" && four_cc(bytes, box.start) === "nclx");
  const icc = own.find((box) => box.type === "colr" && four_cc(bytes, box.start) !== "nclx");
  if (colr) {
    const primaries = u16(bytes, colr.start + 4);
    const transfer = u16(bytes, colr.start + 6);
    header.colour = `${AVIF_PRIMARIES[primaries] ?? `primaries ${primaries}`}, ${AVIF_TRANSFER[transfer] ?? `transfer ${transfer}`}`;
    header.hdr = HDR_TRANSFERS.has(transfer);
    header.extra.push({ label: "Range", value: bytes[colr.start + 10] & 0x80 ? "full" : "limited" });
  } else if (icc) {
    header.colour = "ICC profile";
  }
  const clli = child(own, "clli");
  if (clli) {
    header.hdr = true;
    header.extra.push({ label: "Max light", value: `${u16(bytes, clli.start)} nits` });
  }
  return header;
}

function primary_properties(bytes: Uint8Array, in_iprp: Box[], properties: Box[], primary: number): Box[] {
  const ipma = child(in_iprp, "ipma");
  if (!ipma) return properties;
  const version = bytes[ipma.start];
  const wide = (bytes[ipma.start + 3] & 1) === 1;
  let at = ipma.start + 4;
  const count = u32(bytes, at);
  at += 4;
  for (let entry = 0; entry < count && at < ipma.end; entry++) {
    const item = version < 1 ? u16(bytes, at) : u32(bytes, at);
    at += version < 1 ? 2 : 4;
    const associations = bytes[at++];
    const indexes: number[] = [];
    for (let index = 0; index < associations; index++) {
      indexes.push(wide ? u16(bytes, at) & 0x7fff : bytes[at] & 0x7f);
      at += wide ? 2 : 1;
    }
    if (item === primary) return indexes.flatMap((index) => (properties[index - 1] ? [properties[index - 1]] : []));
  }
  return properties;
}

class Bits {
  private position = 0;

  constructor(private readonly bytes: Uint8Array) {}

  read(count: number): number {
    let value = 0;
    for (let bit = 0; bit < count; bit++) {
      const byte = this.bytes[this.position >> 3];
      if (byte === undefined) throw new Error("Header ends early");
      value += ((byte >> (this.position & 7)) & 1) * 2 ** bit;
      this.position++;
    }
    return value;
  }

  bool(): boolean {
    return this.read(1) === 1;
  }

  /** `U32(…)`: two bits pick one of four distributions, each `[bits, offset]`; zero bits is a constant. */
  u32(...choices: [number, number][]): number {
    const [bits, offset] = choices[this.read(2)];
    return offset + (bits ? this.read(bits) : 0);
  }

  enumeration(): number {
    return this.u32([0, 0], [0, 1], [4, 2], [6, 18]);
  }
}

const SIZE: [number, number][] = [
  [9, 1],
  [13, 1],
  [18, 1],
  [30, 1],
];
const RATIOS: [number, number][] = [
  [1, 1],
  [12, 10],
  [4, 3],
  [3, 2],
  [16, 9],
  [5, 4],
  [2, 1],
];

function read_size(bits: Bits): { width: number; height: number } {
  const small = bits.bool();
  const height = small ? (bits.read(5) + 1) * 8 : bits.u32(...SIZE);
  const ratio = bits.read(3);
  if (ratio > 0) return { width: Math.floor((height * RATIOS[ratio - 1][0]) / RATIOS[ratio - 1][1]), height };
  return { width: small ? (bits.read(5) + 1) * 8 : bits.u32(...SIZE), height };
}

function skip_preview(bits: Bits) {
  const div8 = bits.bool();
  const size = (): number => (div8 ? bits.u32([0, 16], [0, 32], [5, 1], [9, 33]) : bits.u32([6, 1], [8, 65], [10, 321], [12, 1345]));
  size();
  if (bits.read(3) === 0) size();
}

function read_bit_depth(bits: Bits): { depth: number; float: boolean } {
  const float = bits.bool();
  if (!float) return { depth: bits.u32([0, 8], [0, 10], [0, 12], [6, 1]), float };
  const depth = bits.u32([0, 32], [0, 16], [0, 24], [6, 1]);
  bits.read(4);
  return { depth, float };
}

function skip_custom_xy(bits: Bits) {
  for (let axis = 0; axis < 2; axis++) bits.u32([19, 0], [19, 524288], [20, 1048576], [21, 2097152]);
}

function codestream(bytes: Uint8Array, extra: ImageHeader["extra"]): Uint8Array {
  if (bytes[0] === 0xff) return bytes;
  const top = boxes(bytes, 0, bytes.length);
  extra.push({ label: "Container", value: "ISO BMFF" });
  if (child(top, "jbrd")) extra.push({ label: "Recompressed JPEG", value: "yes, the original JPEG can be restored" });
  if (child(top, "Exif")) extra.push({ label: "Exif", value: "yes" });
  const full = child(top, "jxlc");
  if (full) return bytes.subarray(full.start, full.end);
  const part = child(top, "jxlp");
  if (part) return bytes.subarray(part.start + 4, part.end);
  throw new Error("No codestream");
}

function parse_jxl(bytes: Uint8Array): ImageHeader {
  const header: ImageHeader = {
    format: "JPEG XL",
    width: null,
    height: null,
    bit_depth: null,
    float: false,
    alpha: null,
    animated: null,
    hdr: null,
    colour: null,
    extra: [],
  };
  const stream = codestream(bytes, header.extra);
  const bits = new Bits(stream.subarray(2));
  Object.assign(header, read_size(bits));

  if (bits.bool()) {
    Object.assign(header, { bit_depth: 8, alpha: false, animated: false, hdr: false, colour: "sRGB" });
    return header;
  }
  let orientation = 1;
  if (bits.bool()) {
    orientation = bits.read(3) + 1;
    if (bits.bool()) read_size(bits);
    if (bits.bool()) skip_preview(bits);
    header.animated = bits.bool();
    if (header.animated) {
      const numerator = bits.u32([0, 100], [0, 1000], [10, 1], [30, 1]);
      const denominator = bits.u32([0, 1], [8, 1], [10, 1], [30, 1]);
      const loops = bits.u32([0, 0], [3, 0], [16, 0], [32, 0]);
      bits.bool();
      header.extra.push({ label: "Frame rate", value: `${Math.round((numerator / denominator) * 100) / 100} ticks/s` });
      header.extra.push({ label: "Loops", value: loops === 0 ? "forever" : String(loops) });
    }
  } else {
    header.animated = false;
  }
  if (orientation !== 1) header.extra.push({ label: "Orientation", value: String(orientation) });

  const { depth, float } = read_bit_depth(bits);
  header.bit_depth = depth;
  header.float = float;
  bits.bool();

  const extra_channels = bits.u32([0, 0], [0, 1], [4, 2], [12, 1]);
  header.alpha = false;
  for (let channel = 0; channel < extra_channels; channel++) {
    if (bits.bool()) {
      header.alpha = true;
      continue;
    }
    const type = bits.enumeration();
    read_bit_depth(bits);
    bits.u32([0, 0], [0, 3], [0, 4], [3, 1]);
    const name_length = bits.u32([0, 0], [4, 0], [5, 16], [10, 48]);
    for (let index = 0; index < name_length; index++) bits.read(8);
    if (type === 0) {
      header.alpha = true;
      bits.bool();
    } else if (type === 2) {
      for (let index = 0; index < 4; index++) bits.read(16);
    } else if (type === 5) {
      bits.u32([0, 1], [2, 0], [4, 3], [8, 19]);
    }
  }
  if (extra_channels > (header.alpha ? 1 : 0)) header.extra.push({ label: "Extra channels", value: String(extra_channels) });

  const xyb = bits.bool();
  header.extra.push({ label: "Mode", value: xyb ? "lossy (XYB)" : "lossless or modular" });

  if (bits.bool()) {
    header.colour = "sRGB";
    header.hdr = false;
    return header;
  }
  const want_icc = bits.bool();
  const space = bits.enumeration();
  if (want_icc) {
    header.colour = "ICC profile";
    return header;
  }
  const names = ["RGB", "grey", "XYB", "unknown"];
  if (space !== 2) {
    const white = bits.enumeration();
    if (white === 2) skip_custom_xy(bits);
  }
  let primaries: string | null = null;
  if (space !== 1 && space !== 2) {
    const code = bits.enumeration();
    if (code === 2) for (let index = 0; index < 3; index++) skip_custom_xy(bits);
    primaries = JXL_PRIMARIES[code] ?? `primaries ${code}`;
  }
  let transfer: string;
  if (bits.bool()) {
    transfer = `gamma ${(bits.read(24) / 10_000_000).toFixed(3)}`;
    header.hdr = false;
  } else {
    const code = bits.enumeration();
    transfer = TRANSFER[code] ?? `transfer ${code}`;
    header.hdr = HDR_TRANSFERS.has(code);
  }
  header.colour = [space === 0 ? primaries : names[space], transfer].filter(Boolean).join(", ");
  return header;
}
