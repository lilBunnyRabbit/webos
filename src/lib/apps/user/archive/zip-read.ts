import { crc32 } from "./crc32";
import {
  CENTRAL_HEADER_SIZE,
  END64_LOCATOR_SIZE,
  END_SIZE,
  Flag,
  LOCAL_HEADER_SIZE,
  MAX_16,
  MAX_32,
  Method,
  Signature,
  ZIP64_EXTRA,
  ZipError,
  checksum_stream,
  collect,
  decode_name,
  from_dos_datetime,
  safe_segments,
  type Bytes,
  type StreamOptions,
} from "./zip-format";

const UNICODE_PATH_EXTRA = 0x7075;
const END64_SIZE = 56;

export interface ZipEntry {
  name: string;
  path: string[];
  directory: boolean;
  method: number;
  flags: number;
  crc: number;
  compressed_size: number;
  size: number;
  modified: Date;
  local_offset: number;
  encrypted: boolean;
}

export interface ZipArchive {
  entries: ZipEntry[];
  comment: string;
  zip64: boolean;
}

async function read_bytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function view_of(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function u64(view: DataView, offset: number): number {
  const value = view.getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new ZipError("The archive is too large to read.");
  return Number(value);
}

function find_end(view: DataView): number {
  for (let i = view.byteLength - END_SIZE; i >= 0; i--) {
    if (view.getUint32(i, true) !== Signature.END) continue;
    if (i + END_SIZE + view.getUint16(i + 20, true) <= view.byteLength) return i;
  }
  return -1;
}

export async function read_zip(blob: Blob): Promise<ZipArchive> {
  const tail_start = Math.max(0, blob.size - (END_SIZE + MAX_16 + END64_LOCATOR_SIZE));
  const tail = await read_bytes(blob, tail_start, blob.size);
  const tail_view = view_of(tail);
  const end = find_end(tail_view);
  if (end < 0) throw new ZipError("This isn't a zip archive, or it's cut off.");

  let count = tail_view.getUint16(end + 10, true);
  let directory_size = tail_view.getUint32(end + 12, true);
  let directory_offset = tail_view.getUint32(end + 16, true);
  const comment = decode_name(tail.subarray(end + END_SIZE, end + END_SIZE + tail_view.getUint16(end + 20, true)), true);

  const locator = end - END64_LOCATOR_SIZE;
  const zip64 = locator >= 0 && tail_view.getUint32(locator, true) === Signature.END64_LOCATOR;
  if (zip64) {
    const record_offset = u64(tail_view, locator + 8);
    const record = view_of(await read_bytes(blob, record_offset, record_offset + END64_SIZE));
    if (record.byteLength < END64_SIZE || record.getUint32(0, true) !== Signature.END64) {
      throw new ZipError("The archive's ZIP64 directory is damaged.");
    }
    count = u64(record, 32);
    directory_size = u64(record, 40);
    directory_offset = u64(record, 48);
  } else if (count === MAX_16 || directory_size === MAX_32 || directory_offset === MAX_32) {
    throw new ZipError("The archive's ZIP64 directory is missing.");
  }

  if (directory_offset + directory_size > blob.size) throw new ZipError("The archive is cut off.");
  const directory = await read_bytes(blob, directory_offset, directory_offset + directory_size);
  return { entries: parse_central_directory(directory, count), comment, zip64 };
}

function parse_central_directory(bytes: Uint8Array, count: number): ZipEntry[] {
  const view = view_of(bytes);
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + CENTRAL_HEADER_SIZE > bytes.length || view.getUint32(p, true) !== Signature.CENTRAL) {
      throw new ZipError("The archive's file list is damaged.");
    }
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const time = view.getUint16(p + 12, true);
    const date = view.getUint16(p + 14, true);
    const crc = view.getUint32(p + 16, true);
    let compressed_size = view.getUint32(p + 20, true);
    let size = view.getUint32(p + 24, true);
    const name_length = view.getUint16(p + 28, true);
    const extra_length = view.getUint16(p + 30, true);
    const comment_length = view.getUint16(p + 32, true);
    const external = view.getUint32(p + 38, true);
    let local_offset = view.getUint32(p + 42, true);

    const name_bytes = bytes.subarray(p + CENTRAL_HEADER_SIZE, p + CENTRAL_HEADER_SIZE + name_length);
    let name = decode_name(name_bytes, (flags & Flag.UTF8) !== 0);

    let e = p + CENTRAL_HEADER_SIZE + name_length;
    const extra_end = e + extra_length;
    while (e + 4 <= extra_end) {
      const id = view.getUint16(e, true);
      const length = view.getUint16(e + 2, true);
      const data = e + 4;
      if (id === ZIP64_EXTRA) {
        let q = data;
        if (size === MAX_32) (size = u64(view, q)), (q += 8);
        if (compressed_size === MAX_32) (compressed_size = u64(view, q)), (q += 8);
        if (local_offset === MAX_32) local_offset = u64(view, q);
      } else if (id === UNICODE_PATH_EXTRA && length > 5 && view.getUint8(data) === 1) {
        if (view.getUint32(data + 1, true) === crc32(name_bytes)) {
          name = decode_name(bytes.subarray(data + 5, data + length), true);
        }
      }
      e = data + length;
    }

    const directory = name.endsWith("/") || name.endsWith("\\") || ((external & 0x10) !== 0 && size === 0);
    entries.push({
      name,
      path: safe_segments(name),
      directory,
      method,
      flags,
      crc,
      compressed_size,
      size,
      modified: from_dos_datetime(time, date),
      local_offset,
      encrypted: (flags & Flag.ENCRYPTED) !== 0,
    });
    p = extra_end + comment_length;
  }
  return entries;
}

export function readable(entry: ZipEntry): boolean {
  return !entry.encrypted && (entry.method === Method.STORE || entry.method === Method.DEFLATE);
}

// Sizes come from the central directory, so entries written with a data descriptor read the same way.
export async function entry_stream(blob: Blob, entry: ZipEntry, options: StreamOptions = {}): Promise<ReadableStream<Bytes>> {
  if (entry.encrypted) throw new ZipError(`"${entry.name}" is password-protected, which isn't supported.`);
  if (entry.method !== Method.STORE && entry.method !== Method.DEFLATE) {
    throw new ZipError(`"${entry.name}" uses compression method ${entry.method}, which isn't supported.`);
  }

  const header = view_of(await read_bytes(blob, entry.local_offset, entry.local_offset + LOCAL_HEADER_SIZE));
  if (header.byteLength < LOCAL_HEADER_SIZE || header.getUint32(0, true) !== Signature.LOCAL) {
    throw new ZipError(`"${entry.name}" is damaged (bad local header).`);
  }
  const start = entry.local_offset + LOCAL_HEADER_SIZE + header.getUint16(26, true) + header.getUint16(28, true);
  if (start + entry.compressed_size > blob.size) throw new ZipError(`"${entry.name}" is cut off.`);

  const raw = blob.slice(start, start + entry.compressed_size).stream();
  const data = entry.method === Method.DEFLATE ? raw.pipeThrough(new DecompressionStream("deflate-raw")) : raw;
  const { stream } = checksum_stream({
    ...options,
    on_end: (result) => {
      if (result.size !== entry.size || result.crc !== entry.crc) {
        throw new ZipError(`"${entry.name}" is damaged (checksum mismatch).`);
      }
    },
  });
  return data.pipeThrough(stream);
}

export async function entry_blob(blob: Blob, entry: ZipEntry, options: StreamOptions = {}): Promise<Blob> {
  // Not `new Response(stream).blob()`: it replaces a stream error (checksum, cancel) with a bare "Failed to fetch".
  return new Blob(await collect(await entry_stream(blob, entry, options)));
}
