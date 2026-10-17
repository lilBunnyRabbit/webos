import type { Tagged } from "$lib/core/api/services/shell/type";

export const APP_ID = "hex-viewer";
export const BYTES_PER_ROW = 16;

export const hex_byte = (byte: number): string => byte.toString(16).padStart(2, "0");

export const is_printable = (byte: number): boolean => byte >= 0x20 && byte <= 0x7e;

export const ascii_char = (byte: number): string => (is_printable(byte) ? String.fromCharCode(byte) : ".");

export function offset_digits(size: number): number {
  return Math.max(8, Math.max(0, size - 1).toString(16).length);
}

export function format_offset(offset: number, digits = 8): string {
  return offset.toString(16).padStart(digits, "0");
}

export function row_count(size: number): number {
  return Math.ceil(size / BYTES_PER_ROW);
}

export function hex_groups(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < BYTES_PER_ROW; index++) {
    if (index > 0 && index % 2 === 0) text += " ";
    text += index < bytes.length ? hex_byte(bytes[index]) : "  ";
  }
  return text;
}

export function ascii_text(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += ascii_char(byte);
  return text;
}

export function format_row(bytes: Uint8Array, offset: number, digits = 8): string {
  return `${format_offset(offset, digits)}: ${hex_groups(bytes)}  ${ascii_text(bytes)}`;
}

// Plain digits read as decimal even though offsets display in hex: "100" meaning 256 surprises more than it helps.
export function parse_offset(input: string): number | null {
  const text = input.trim().toLowerCase().replaceAll("_", "");
  if (!text) return null;
  let value: number;
  if (/^0x[0-9a-f]+$/.test(text)) value = parseInt(text.slice(2), 16);
  else if (/^[0-9a-f]+h$/.test(text)) value = parseInt(text.slice(0, -1), 16);
  else if (/^\d+$/.test(text)) value = Number(text);
  else if (/^[0-9a-f]+$/.test(text)) value = parseInt(text, 16);
  else return null;
  return Number.isSafeInteger(value) ? value : null;
}

export const Endian = { LITTLE: "le", BIG: "be" } as const;
export type Endian = (typeof Endian)[keyof typeof Endian];

export interface Inspection {
  label: string;
  value: string;
}

export function inspect(bytes: Uint8Array, endian: Endian): Inspection[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = endian === Endian.LITTLE;
  const read = (size: number, get: () => number | string) => (bytes.length >= size ? String(get()) : "—");
  return [
    { label: "u8", value: read(1, () => view.getUint8(0)) },
    { label: "i8", value: read(1, () => view.getInt8(0)) },
    { label: "u16", value: read(2, () => view.getUint16(0, little)) },
    { label: "i16", value: read(2, () => view.getInt16(0, little)) },
    { label: "u32", value: read(4, () => view.getUint32(0, little)) },
    { label: "i32", value: read(4, () => view.getInt32(0, little)) },
    { label: "f32", value: read(4, () => Number(view.getFloat32(0, little).toPrecision(7))) },
    { label: "f64", value: read(8, () => view.getFloat64(0, little)) },
    { label: "bin", value: read(1, () => view.getUint8(0).toString(2).padStart(8, "0")) },
  ];
}

export function hex_string(bytes: Uint8Array): string {
  return Array.from(bytes, hex_byte).join(" ");
}

export interface DumpRow {
  offset: number;
  hex: string;
  ascii: string;
}

export function dump_rows(bytes: Uint8Array, offset: number): DumpRow[] {
  const rows: DumpRow[] = [];
  for (let start = 0; start < bytes.length; start += BYTES_PER_ROW) {
    const row = bytes.subarray(start, start + BYTES_PER_ROW);
    rows.push({ offset: offset + start, hex: hex_groups(row), ascii: ascii_text(row) });
  }
  return rows;
}

const DUMP_CHUNK = 4096 * BYTES_PER_ROW;

export async function* dump_blob(blob: Blob, path: string, offset: number, length: number, signal?: AbortSignal): AsyncGenerator<Tagged> {
  const end = Math.min(blob.size, offset + length);
  for (let start = offset; start < end; start += DUMP_CHUNK) {
    if (signal?.aborted) return;
    const bytes = new Uint8Array(await blob.slice(start, Math.min(end, start + DUMP_CHUNK)).arrayBuffer());
    for (const row of dump_rows(bytes, start)) yield { $type: "hex-row", ...row, path };
  }
}
