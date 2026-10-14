import {
  CENTRAL_HEADER_SIZE,
  DIRECTORY_ATTRIBUTE,
  END_SIZE,
  Flag,
  LOCAL_HEADER_SIZE,
  MAX_16,
  MAX_32,
  Method,
  Signature,
  abort_error,
  checksum_stream,
  collect,
  is_ascii,
  to_dos_datetime,
  ZipError,
  type StreamOptions,
} from "./zip-format";

export interface ZipSource {
  name: string;
  directory?: boolean;
  data?: Blob;
  modified?: Date;
}

export interface WriteOptions extends StreamOptions {
  method: Method;
}

const VERSION_NEEDED = 20;
const VERSION_MADE_BY = (3 << 8) | VERSION_NEEDED;
const UNIX_DIRECTORY = 0o40755;
const UNIX_FILE = 0o100644;

interface Packed {
  method: Method;
  crc: number;
  size: number;
  payload: Blob;
}

async function pack(data: Blob, method: Method, options: StreamOptions): Promise<Packed> {
  const tap = checksum_stream(options);
  if (method === Method.DEFLATE && data.size > 0) {
    const packed = new Blob(await collect(data.stream().pipeThrough(tap.stream).pipeThrough(new CompressionStream("deflate-raw"))));
    // Incompressible data (already-zipped media) is stored as is rather than grow.
    if (packed.size < tap.result.size) return { method, crc: tap.result.crc, size: tap.result.size, payload: packed };
  } else {
    await collect(data.stream().pipeThrough(tap.stream));
  }
  return { method: Method.STORE, crc: tap.result.crc, size: tap.result.size, payload: data };
}

function header(size: number, write: (view: DataView) => void): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size);
  write(new DataView(bytes.buffer));
  return bytes;
}

// A Blob of parts: stored entries reference the source Blob itself, so nothing is held twice.
export async function write_zip(sources: ZipSource[], options: WriteOptions): Promise<Blob> {
  const { signal } = options;
  const encoder = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  if (sources.length >= MAX_16) throw new ZipError("Too many files for one archive (65,534 at most).");

  for (const source of sources) {
    if (signal?.aborted) throw abort_error(signal);
    const name = source.directory ? `${source.name}/` : source.name;
    const name_bytes = encoder.encode(name);
    if (name_bytes.length > MAX_16) throw new ZipError(`The name "${name}" is too long.`);
    const flags = is_ascii(name) ? 0 : Flag.UTF8;
    const { time, date } = to_dos_datetime(source.modified ?? new Date());

    const packed: Packed = source.directory
      ? { method: Method.STORE, crc: 0, size: 0, payload: new Blob() }
      : await pack(source.data ?? new Blob(), options.method, options);
    if (packed.size >= MAX_32 || packed.payload.size >= MAX_32 || offset >= MAX_32) {
      throw new ZipError("Archives over 4 GB aren't supported.");
    }

    const local = header(LOCAL_HEADER_SIZE, (v) => {
      v.setUint32(0, Signature.LOCAL, true);
      v.setUint16(4, VERSION_NEEDED, true);
      v.setUint16(6, flags, true);
      v.setUint16(8, packed.method, true);
      v.setUint16(10, time, true);
      v.setUint16(12, date, true);
      v.setUint32(14, packed.crc, true);
      v.setUint32(18, packed.payload.size, true);
      v.setUint32(22, packed.size, true);
      v.setUint16(26, name_bytes.length, true);
    });
    central.push(
      header(CENTRAL_HEADER_SIZE, (v) => {
        v.setUint32(0, Signature.CENTRAL, true);
        v.setUint16(4, VERSION_MADE_BY, true);
        v.setUint16(6, VERSION_NEEDED, true);
        v.setUint16(8, flags, true);
        v.setUint16(10, packed.method, true);
        v.setUint16(12, time, true);
        v.setUint16(14, date, true);
        v.setUint32(16, packed.crc, true);
        v.setUint32(20, packed.payload.size, true);
        v.setUint32(24, packed.size, true);
        v.setUint16(28, name_bytes.length, true);
        v.setUint32(38, source.directory ? ((UNIX_DIRECTORY << 16) | DIRECTORY_ATTRIBUTE) >>> 0 : (UNIX_FILE << 16) >>> 0, true);
        v.setUint32(42, offset, true);
      }),
      name_bytes
    );
    parts.push(local, name_bytes, packed.payload);
    offset += LOCAL_HEADER_SIZE + name_bytes.length + packed.payload.size;
  }

  const directory_size = central.reduce((sum, bytes) => sum + bytes.length, 0);
  if (offset + directory_size >= MAX_32) throw new ZipError("Archives over 4 GB aren't supported.");
  const end = header(END_SIZE, (v) => {
    v.setUint32(0, Signature.END, true);
    v.setUint16(8, sources.length, true);
    v.setUint16(10, sources.length, true);
    v.setUint32(12, directory_size, true);
    v.setUint32(16, offset, true);
  });
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}
