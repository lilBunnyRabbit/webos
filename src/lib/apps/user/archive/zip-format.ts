import { crc32 } from "./crc32";

export const Signature = {
  LOCAL: 0x04034b50,
  CENTRAL: 0x02014b50,
  END: 0x06054b50,
  END64: 0x06064b50,
  END64_LOCATOR: 0x07064b50,
  DESCRIPTOR: 0x08074b50,
} as const;

export const Method = {
  STORE: 0,
  DEFLATE: 8,
} as const;
export type Method = (typeof Method)[keyof typeof Method];

export const Flag = {
  ENCRYPTED: 1 << 0,
  DESCRIPTOR: 1 << 3,
  UTF8: 1 << 11,
} as const;

export class ZipError extends Error {
  override name = "ZipError";
}

export const LOCAL_HEADER_SIZE = 30;
export const CENTRAL_HEADER_SIZE = 46;
export const END_SIZE = 22;
export const END64_LOCATOR_SIZE = 20;
export const ZIP64_EXTRA = 0x0001;
export const MAX_32 = 0xffffffff;
export const MAX_16 = 0xffff;
export const DIRECTORY_ATTRIBUTE = 0x10;

export type ProgressHandler = (bytes: number) => void;
export type Bytes = Uint8Array<ArrayBuffer>;

const MIN_DOS_YEAR = 1980;

// DOS time is local time, 2-second resolution, 1980 at the earliest.
export function to_dos_datetime(date: Date): { time: number; date: number } {
  const year = date.getFullYear();
  if (year < MIN_DOS_YEAR) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((Math.min(year, 2107) - MIN_DOS_YEAR) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function from_dos_datetime(time: number, date: number): Date {
  return new Date(
    MIN_DOS_YEAR + (date >> 9),
    Math.max(0, ((date >> 5) & 0xf) - 1),
    Math.max(1, date & 0x1f),
    time >> 11,
    (time >> 5) & 0x3f,
    (time & 0x1f) * 2
  );
}

const CP437_HIGH =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ";

// Without the UTF-8 flag the spec says CP437.
export function decode_name(bytes: Uint8Array, utf8: boolean): string {
  if (utf8) return new TextDecoder().decode(bytes);
  let name = "";
  for (const byte of bytes) name += byte < 0x80 ? String.fromCharCode(byte) : CP437_HIGH[byte - 0x80];
  return name;
}

// Zip-slip guard: no `..`, root or drive prefix can make an entry land outside the target folder.
export function safe_segments(name: string): string[] {
  return name
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== ".." && !/^[a-zA-Z]:$/.test(segment));
}

export function is_ascii(text: string): boolean {
  return /^[\x20-\x7e]*$/.test(text);
}

export function abort_error(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Cancelled", "AbortError");
}

export function is_abort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export interface Checksum {
  crc: number;
  size: number;
}

export interface StreamOptions {
  signal?: AbortSignal;
  on_bytes?: ProgressHandler;
  /** Awaited after each chunk; lets a long job hand the main thread back. */
  pace?: () => Promise<void>;
}

export interface ChecksumOptions extends StreamOptions {
  /** Called with the final checksum when the stream ends; throw to fail the stream. */
  on_end?: (result: Checksum) => void;
}

export function checksum_stream(options: ChecksumOptions = {}): {
  stream: TransformStream<Bytes, Bytes>;
  result: Checksum;
} {
  const { on_bytes, signal, pace, on_end } = options;
  const result: Checksum = { crc: 0, size: 0 };
  const stream = new TransformStream<Bytes, Bytes>({
    async transform(chunk, controller) {
      if (signal?.aborted) throw abort_error(signal);
      result.crc = crc32(chunk, result.crc);
      result.size += chunk.length;
      on_bytes?.(chunk.length);
      controller.enqueue(chunk);
      await pace?.();
    },
    flush() {
      on_end?.(result);
    },
  });
  return { stream, result };
}

export async function collect(stream: ReadableStream<Bytes>): Promise<Bytes[]> {
  const chunks: Bytes[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return chunks;
    chunks.push(value);
  }
}

export function concat(chunks: Bytes[]): Bytes {
  const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function deflate_raw(data: Bytes): Promise<Bytes> {
  return concat(await collect(new Blob([data]).stream().pipeThrough(new CompressionStream("deflate-raw"))));
}

export async function inflate_raw(data: Bytes): Promise<Bytes> {
  return concat(await collect(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))));
}
