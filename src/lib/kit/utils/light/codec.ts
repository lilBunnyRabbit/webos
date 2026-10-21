import { from_base45, to_base45 } from "../base45";
import { encode_symbol, Peeler, repair_degrees } from "./lt";

export const FRAME_PREFIX = "WL1:";
export const MAX_BYTES = 2 * 1024 * 1024;
/** Every `HEADER_EVERY`th frame is the header, so a receiver that starts late learns the name and hash within a second. */
export const HEADER_EVERY = 16;

const ALPHANUMERIC_L: Record<number, number> = { 15: 758, 16: 854, 17: 938, 18: 1046, 19: 1153, 20: 1249 };
export const QR_VERSIONS = Object.keys(ALPHANUMERIC_L).map(Number);

const FrameKind = { HEADER: 0, DATA: 1 } as const;
const DATA_OVERHEAD = 1 + 4 + 4 + 4;
const MAX_TYPE_BYTES = 100;
const MAX_NAME_BYTES = 200;

export interface LightFile {
  name: string;
  type: string;
  bytes: Uint8Array<ArrayBuffer>;
}

export interface LightHeader {
  /** Hash of the header itself: one file at one block size, so a restarted sender continues the same stream. */
  id: number;
  k: number;
  block_size: number;
  /** Bytes on the air: `size` after any deflate. */
  length: number;
  size: number;
  compressed: boolean;
  sha256: Uint8Array;
  type: string;
  name: string;
}

interface DataFrame {
  kind: typeof FrameKind.DATA;
  id: number;
  k: number;
  esi: number;
  payload: Uint8Array;
}

type Frame = { kind: typeof FrameKind.HEADER; header: LightHeader } | DataFrame;

export function block_size_for(version: number): number {
  const capacity = ALPHANUMERIC_L[version];
  if (!capacity) throw new Error(`QR version ${version} isn't one of ${QR_VERSIONS.join(", ")}`);
  const characters = capacity - FRAME_PREFIX.length;
  const bytes = Math.floor(characters / 3) * 2 + (characters % 3 === 2 ? 1 : 0);
  return bytes - DATA_OVERHEAD;
}

const TEXT_TYPES = /^text\/|[/+](json|xml|javascript|ecmascript|x-sh|x-yaml|yaml|toml|csv|svg\+xml)$/;
const TEXT_EXTENSIONS =
  /\.(txt|md|markdown|json|csv|tsv|xml|svg|html?|css|js|mjs|ts|svelte|ya?ml|toml|ini|log|sh|py|rs|go|c|h|cpp|java|sql)$/i;

export function is_text_like(type: string, name: string): boolean {
  return TEXT_TYPES.test(type) || TEXT_EXTENSIONS.test(name);
}

async function through(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function utf8_within(text: string, max: number): Uint8Array {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(text);
  if (bytes.length <= max) return bytes;
  const dot = text.lastIndexOf(".");
  const extension = dot > 0 && text.length - dot <= 16 ? text.slice(dot) : "";
  let stem = Array.from(text.slice(0, text.length - extension.length));
  do {
    stem = stem.slice(0, -1);
    bytes = encoder.encode(stem.join("") + extension);
  } while (bytes.length > max);
  return bytes;
}

function write_header(header: LightHeader): Uint8Array<ArrayBuffer> {
  const type = utf8_within(header.type, MAX_TYPE_BYTES);
  const name = utf8_within(header.name, MAX_NAME_BYTES);
  const bytes = new Uint8Array(1 + 4 + 4 + 2 + 4 + 4 + 1 + 32 + 1 + type.length + 1 + name.length);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, FrameKind.HEADER);
  view.setUint32(1, header.id);
  view.setUint32(5, header.k);
  view.setUint16(9, header.block_size);
  view.setUint32(11, header.length);
  view.setUint32(15, header.size);
  view.setUint8(19, header.compressed ? 1 : 0);
  bytes.set(header.sha256, 20);
  bytes[52] = type.length;
  bytes.set(type, 53);
  bytes[53 + type.length] = name.length;
  bytes.set(name, 54 + type.length);
  return bytes;
}

function write_data(id: number, k: number, esi: number, payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(DATA_OVERHEAD + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, FrameKind.DATA);
  view.setUint32(1, id);
  view.setUint32(5, k);
  view.setUint32(9, esi);
  bytes.set(payload, DATA_OVERHEAD);
  return bytes;
}

function frame_text(bytes: Uint8Array): string {
  return FRAME_PREFIX + to_base45(bytes);
}

export function header_frame(header: LightHeader): string {
  return frame_text(write_header(header));
}

export function read_frame(text: string): Frame | null {
  if (!text.startsWith(FRAME_PREFIX)) return null;
  let bytes: Uint8Array;
  try {
    bytes = from_base45(text.slice(FRAME_PREFIX.length));
  } catch {
    return null;
  }
  if (bytes.length < DATA_OVERHEAD) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kind = view.getUint8(0);
  const id = view.getUint32(1);
  const k = view.getUint32(5);
  if (k < 1) return null;

  if (kind === FrameKind.DATA) {
    const payload = bytes.subarray(DATA_OVERHEAD);
    return payload.length > 0 ? { kind, id, k, esi: view.getUint32(9), payload } : null;
  }
  if (kind !== FrameKind.HEADER || bytes.length < 54) return null;
  const type_length = bytes[52];
  const name_at = 53 + type_length;
  if (bytes.length < name_at + 1 || bytes.length !== name_at + 1 + bytes[name_at]) return null;
  const decoder = new TextDecoder();
  const header: LightHeader = {
    id,
    k,
    block_size: view.getUint16(9),
    length: view.getUint32(11),
    size: view.getUint32(15),
    compressed: view.getUint8(19) === 1,
    sha256: bytes.slice(20, 52),
    type: decoder.decode(bytes.subarray(53, name_at)),
    name: decoder.decode(bytes.subarray(name_at + 1)),
  };
  const sane =
    header.block_size > 0 &&
    header.length <= header.k * header.block_size &&
    (header.k === 1 || header.length > (header.k - 1) * header.block_size);
  return sane && header.size <= MAX_BYTES ? { kind, header } : null;
}

async function header_id(header: LightHeader): Promise<number> {
  const digest = await sha256(write_header({ ...header, id: 0 }));
  return new DataView(digest.buffer).getUint32(0);
}

/**
 * The frames for one file, endless: round after round of the `k` plain blocks then `repair_per_round` fresh repair
 * symbols, with the header every `HEADER_EVERY` frames. Repair numbers never repeat, so a receiver's second round
 * brings only new equations.
 */
export class LightStream {
  readonly repair_per_round: number;
  private readonly cdf: Float64Array;

  constructor(
    readonly header: LightHeader,
    private readonly blocks: Uint8Array[]
  ) {
    this.cdf = repair_degrees(header.k);
    this.repair_per_round = Math.max(8, header.k);
  }

  get round_length(): number {
    const data = this.header.k + this.repair_per_round;
    return data + Math.ceil(data / (HEADER_EVERY - 1));
  }

  esi(position: number): number | null {
    if (position % HEADER_EVERY === 0) return null;
    const slot = position - Math.floor(position / HEADER_EVERY) - 1;
    const per_round = this.header.k + this.repair_per_round;
    const round = Math.floor(slot / per_round);
    const offset = slot % per_round;
    return offset < this.header.k ? offset : this.header.k + round * this.repair_per_round + (offset - this.header.k);
  }

  frame(position: number): string {
    const esi = this.esi(position);
    if (esi === null) return header_frame(this.header);
    return frame_text(write_data(this.header.id, this.header.k, esi, encode_symbol(this.blocks, esi, this.cdf)));
  }
}

export async function encode_light(file: LightFile, version: number): Promise<LightStream> {
  if (file.bytes.length > MAX_BYTES) throw new Error("Files by light stop at 2 MB");
  const block_size = block_size_for(version);
  let data = file.bytes;
  let compressed = false;
  if (is_text_like(file.type, file.name) && data.length > 0) {
    const deflated = await through(data, new CompressionStream("deflate-raw"));
    if (deflated.length < data.length) {
      data = deflated;
      compressed = true;
    }
  }
  const k = Math.max(1, Math.ceil(data.length / block_size));
  const blocks = Array.from({ length: k }, (_, index) => {
    const block = new Uint8Array(block_size);
    block.set(data.subarray(index * block_size, (index + 1) * block_size));
    return block;
  });
  const header: LightHeader = {
    id: 0,
    k,
    block_size,
    length: data.length,
    size: file.bytes.length,
    compressed,
    sha256: await sha256(file.bytes),
    type: file.type,
    name: file.name,
  };
  header.id = await header_id(header);
  return new LightStream(header, blocks);
}

/** Frames to send with about 20% of them missed, from simulation (`codec.test.ts`): 1.43× `k` on average. */
export function estimate_frames(k: number): number {
  return Math.ceil(k * 1.45) + HEADER_EVERY;
}

export const LightResult = {
  NOT_A_FRAME: "not-a-frame",
  /** A frame of another file, or the same file at another speed. */
  FOREIGN: "foreign",
  DUPLICATE: "duplicate",
  ADDED: "added",
  COMPLETE: "complete",
} as const;
export type LightResult = (typeof LightResult)[keyof typeof LightResult];

export class LightDecoder {
  header: LightHeader | null = null;
  private id: number | null = null;
  private peeler: Peeler | null = null;
  private block_size = 0;
  private readonly seen = new Set<number>();
  frames = 0;

  get k(): number {
    return this.peeler?.k ?? 0;
  }

  get known(): number {
    return this.peeler?.known ?? 0;
  }

  get progress(): number {
    return this.peeler ? this.peeler.known / this.peeler.k : 0;
  }

  get complete(): boolean {
    return this.header !== null && this.peeler?.complete === true;
  }

  add(text: string): LightResult {
    const frame = read_frame(text);
    if (!frame) return LightResult.NOT_A_FRAME;
    const id = frame.kind === FrameKind.HEADER ? frame.header.id : frame.id;
    const k = frame.kind === FrameKind.HEADER ? frame.header.k : frame.k;
    if (this.id === null) {
      this.id = id;
      this.peeler = new Peeler(k);
    }
    if (id !== this.id || k !== this.peeler!.k) return LightResult.FOREIGN;
    this.frames++;

    if (frame.kind === FrameKind.HEADER) {
      if (this.header) return LightResult.DUPLICATE;
      if (this.block_size && frame.header.block_size !== this.block_size) return LightResult.FOREIGN;
      this.header = frame.header;
      this.block_size = frame.header.block_size;
    } else {
      if (this.seen.has(frame.esi)) return LightResult.DUPLICATE;
      if (this.block_size && frame.payload.length !== this.block_size) return LightResult.FOREIGN;
      this.block_size = frame.payload.length;
      this.seen.add(frame.esi);
      this.peeler!.add(frame.esi, frame.payload);
    }
    return this.complete ? LightResult.COMPLETE : LightResult.ADDED;
  }

  /** The file, once its SHA-256 matches the header's. Throws on a damaged or forged transfer. */
  async result(): Promise<LightFile> {
    const header = this.header;
    if (!header || !this.peeler?.complete) throw new Error("Not every block is in yet");
    const joined = new Uint8Array(header.k * header.block_size);
    this.peeler.blocks.forEach((block, index) => joined.set(block!, index * header.block_size));
    let bytes = joined.slice(0, header.length);
    if (header.compressed)
      bytes = await through(bytes, new DecompressionStream("deflate-raw")).catch(() => new Uint8Array(0));
    const digest = await sha256(bytes);
    if (bytes.length !== header.size || !equal_bytes(digest, header.sha256))
      throw new Error("The file arrived damaged. Scan again");
    return { name: header.name, type: header.type, bytes };
  }

  reset(): void {
    this.header = null;
    this.id = null;
    this.peeler = null;
    this.block_size = 0;
    this.seen.clear();
    this.frames = 0;
  }
}

export function equal_bytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}
