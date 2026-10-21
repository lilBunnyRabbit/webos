const TTC_TAG = 0x74746366;

export function is_collection(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) === TTC_TAG;
}

interface TableRecord {
  tag: number;
  checksum: number;
  offset: number;
  length: number;
}

function read_records(view: DataView, at: number): { version: number; records: TableRecord[] } {
  const count = view.getUint16(at + 4);
  const records: TableRecord[] = [];
  for (let index = 0; index < count; index++) {
    const record = at + 12 + index * 16;
    records.push({ tag: view.getUint32(record), checksum: view.getUint32(record + 4), offset: view.getUint32(record + 8), length: view.getUint32(record + 12) });
  }
  return { version: view.getUint32(at), records };
}

function write_directory(view: DataView, at: number, version: number, records: readonly TableRecord[]) {
  const count = records.length;
  const search_range = 16 * 2 ** Math.floor(Math.log2(count));
  view.setUint32(at, version);
  view.setUint16(at + 4, count);
  view.setUint16(at + 6, search_range);
  view.setUint16(at + 8, Math.log2(search_range / 16));
  view.setUint16(at + 10, count * 16 - search_range);
  records.forEach((record, index) => {
    const entry = at + 12 + index * 16;
    view.setUint32(entry, record.tag);
    view.setUint32(entry + 4, record.checksum);
    view.setUint32(entry + 8, record.offset);
    view.setUint32(entry + 12, record.length);
  });
}

const padded = (length: number) => Math.ceil(length / 4) * 4;

/**
 * The faces of a TrueType Collection as standalone sfnt fonts, tables in directory order. `FontFace` only loads the
 * first face of a collection, so each face is registered from its own buffer. A single font comes back as is.
 */
export function split_collection(bytes: Uint8Array): Uint8Array<ArrayBuffer>[] {
  if (!is_collection(bytes)) return [bytes.slice()];
  try {
    return split_faces(bytes);
  } catch {
    throw new Error("This font collection is damaged");
  }
}

function split_faces(bytes: Uint8Array): Uint8Array<ArrayBuffer>[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(8);
  if (count < 1 || count > 256) throw new RangeError();
  return Array.from({ length: count }, (_, index) => {
    const { version, records } = read_records(view, view.getUint32(12 + index * 4));
    const header = 12 + records.length * 16;
    const out = new Uint8Array(header + records.reduce((sum, record) => sum + padded(record.length), 0));
    let offset = header;
    const placed = records.map((record) => {
      if (record.offset + record.length > bytes.length) throw new RangeError();
      out.set(bytes.subarray(record.offset, record.offset + record.length), offset);
      const next = { ...record, offset };
      offset += padded(record.length);
      return next;
    });
    write_directory(new DataView(out.buffer), 0, version, placed);
    return out;
  });
}

export function write_collection(fonts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const parsed = fonts.map((font) => ({ font, ...read_records(new DataView(font.buffer, font.byteOffset, font.byteLength), 0) }));
  const header = 12 + fonts.length * 4;
  const directories = parsed.map((entry) => 12 + entry.records.length * 16);
  const tables = parsed.reduce((sum, entry) => sum + entry.records.reduce((total, record) => total + padded(record.length), 0), 0);
  const out = new Uint8Array(header + directories.reduce((a, b) => a + b, 0) + tables);
  const view = new DataView(out.buffer);
  view.setUint32(0, TTC_TAG);
  view.setUint32(4, 0x00010000);
  view.setUint32(8, fonts.length);
  let directory = header;
  let offset = header + directories.reduce((a, b) => a + b, 0);
  parsed.forEach((entry, index) => {
    view.setUint32(12 + index * 4, directory);
    const placed = entry.records.map((record) => {
      out.set(entry.font.subarray(record.offset, record.offset + record.length), offset);
      const next = { ...record, offset };
      offset += padded(record.length);
      return next;
    });
    write_directory(view, directory, entry.version, placed);
    directory += directories[index];
  });
  return out;
}
