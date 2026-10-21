import { describe, expect, test } from "vitest";
import { is_collection, split_collection, write_collection } from "./font-collection";

function sfnt(tables: Record<string, number[]>): Uint8Array {
  const tags = Object.keys(tables).sort();
  const padded = (length: number) => Math.ceil(length / 4) * 4;
  const header = 12 + tags.length * 16;
  const out = new Uint8Array(header + tags.reduce((sum, tag) => sum + padded(tables[tag].length), 0));
  const view = new DataView(out.buffer);
  const search_range = 16 * 2 ** Math.floor(Math.log2(tags.length));
  view.setUint32(0, 0x00010000);
  view.setUint16(4, tags.length);
  view.setUint16(6, search_range);
  view.setUint16(8, Math.log2(search_range / 16));
  view.setUint16(10, tags.length * 16 - search_range);
  let offset = header;
  tags.forEach((tag, index) => {
    const record = 12 + index * 16;
    for (let char = 0; char < 4; char++) view.setUint8(record + char, tag.charCodeAt(char));
    view.setUint32(record + 4, 0x1234 + index);
    view.setUint32(record + 8, offset);
    view.setUint32(record + 12, tables[tag].length);
    out.set(tables[tag], offset);
    offset += padded(tables[tag].length);
  });
  return out;
}

describe("font collections", () => {
  test("splitting a written collection gives back each font byte for byte", () => {
    const one = sfnt({ head: [1, 2, 3, 4, 5], name: [9, 9] });
    const two = sfnt({ "OS/2": [7, 7, 7, 7], glyf: [1], head: [8, 8, 8] });
    const collection = write_collection([one, two]);
    expect(is_collection(collection)).toBe(true);
    expect(is_collection(one)).toBe(false);
    const [first, second] = split_collection(collection);
    expect([...first]).toEqual([...one]);
    expect([...second]).toEqual([...two]);
  });

  test("a single font comes back as is, and a broken collection throws", () => {
    const one = sfnt({ head: [1] });
    expect(split_collection(one).map((bytes) => [...bytes])).toEqual([[...one]]);
    const broken = write_collection([one]).slice(0, 20);
    expect(() => split_collection(broken)).toThrow(/damaged/);
  });
});
