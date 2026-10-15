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
} from "./format";

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
export class ZipWriter {
  private readonly encoder = new TextEncoder();
  private readonly parts: BlobPart[] = [];
  private readonly central: Uint8Array<ArrayBuffer>[] = [];
  private offset = 0;
  private count = 0;

  constructor(private readonly method: Method) {}

  /** Appends one entry. Entries go in the order they're added, so adds must not overlap. */
  async add(source: ZipSource, options: StreamOptions = {}): Promise<void> {
    const { signal } = options;
    if (signal?.aborted) throw abort_error(signal);
    if (this.count + 1 >= MAX_16) throw new ZipError("Too many files for one archive (65,534 at most).");
    const name = source.directory ? `${source.name}/` : source.name;
    const name_bytes = this.encoder.encode(name);
    if (name_bytes.length > MAX_16) throw new ZipError(`The name "${name}" is too long.`);
    const flags = is_ascii(name) ? 0 : Flag.UTF8;
    const { time, date } = to_dos_datetime(source.modified ?? new Date());

    const packed: Packed = source.directory
      ? { method: Method.STORE, crc: 0, size: 0, payload: new Blob() }
      : await pack(source.data ?? new Blob(), this.method, options);
    if (packed.size >= MAX_32 || packed.payload.size >= MAX_32 || this.offset >= MAX_32) {
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
    const offset = this.offset;
    this.central.push(
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
    this.parts.push(local, name_bytes, packed.payload);
    this.offset += LOCAL_HEADER_SIZE + name_bytes.length + packed.payload.size;
    this.count++;
  }

  finish(): Blob {
    const directory_size = this.central.reduce((sum, bytes) => sum + bytes.length, 0);
    if (this.offset + directory_size >= MAX_32) throw new ZipError("Archives over 4 GB aren't supported.");
    const end = header(END_SIZE, (v) => {
      v.setUint32(0, Signature.END, true);
      v.setUint16(8, this.count, true);
      v.setUint16(10, this.count, true);
      v.setUint32(12, directory_size, true);
      v.setUint32(16, this.offset, true);
    });
    return new Blob([...this.parts, ...this.central, end], { type: "application/zip" });
  }
}

export async function write_zip(sources: ZipSource[], options: WriteOptions): Promise<Blob> {
  if (sources.length >= MAX_16) throw new ZipError("Too many files for one archive (65,534 at most).");
  const writer = new ZipWriter(options.method);
  for (const source of sources) await writer.add(source, options);
  return writer.finish();
}
