export const Asn1Tag = {
  BOOLEAN: 0x01,
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  UTF8_STRING: 0x0c,
  PRINTABLE_STRING: 0x13,
  T61_STRING: 0x14,
  IA5_STRING: 0x16,
  UTC_TIME: 0x17,
  GENERALIZED_TIME: 0x18,
  UNIVERSAL_STRING: 0x1c,
  BMP_STRING: 0x1e,
  SEQUENCE: 0x30,
  SET: 0x31,
} as const;

export interface Asn1Node {
  /** The identifier byte as is: class, constructed bit and tag number. */
  tag: number;
  /** The whole encoding, header included. */
  raw: Uint8Array<ArrayBuffer>;
  content: Uint8Array<ArrayBuffer>;
  children: Asn1Node[];
}

export class Asn1Error extends Error {
  name = "Asn1Error";
}

const MAX_DEPTH = 64;

export function read_node(bytes: Uint8Array<ArrayBuffer>, offset = 0, depth = 0): Asn1Node {
  if (depth > MAX_DEPTH) throw new Asn1Error("Nested too deep");
  if (offset + 2 > bytes.length) throw new Asn1Error("Truncated");
  const tag = bytes[offset];
  if ((tag & 0x1f) === 0x1f) throw new Asn1Error("Multi-byte tags aren't used in certificates");

  let length = bytes[offset + 1];
  let header = 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0) throw new Asn1Error("Indefinite length isn't DER");
    if (count > 4) throw new Asn1Error("Length too large");
    if (offset + 2 + count > bytes.length) throw new Asn1Error("Truncated");
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[offset + 2 + i];
    header += count;
  }

  const end = offset + header + length;
  if (end > bytes.length) throw new Asn1Error("Truncated");
  const raw = bytes.subarray(offset, end);
  const content = bytes.subarray(offset + header, end);
  const children: Asn1Node[] = [];
  if (tag & 0x20) {
    for (let at = 0; at < content.length; at += children[children.length - 1].raw.length)
      children.push(read_node(content, at, depth + 1));
  }
  return { tag, raw, content, children };
}

export function expect_tag(node: Asn1Node | undefined, tag: number, what: string): Asn1Node {
  if (!node || node.tag !== tag) throw new Asn1Error(`Expected ${what}`);
  return node;
}

export function read_oid(content: Uint8Array): string {
  const arcs: number[] = [];
  let value = 0;
  for (const byte of content) {
    value = value * 128 + (byte & 0x7f);
    if (byte & 0x80) continue;
    if (arcs.length === 0) arcs.push(value < 80 ? Math.floor(value / 40) : 2, value < 80 ? value % 40 : value - 80);
    else arcs.push(value);
    value = 0;
  }
  return arcs.join(".");
}

function utf16be(content: Uint8Array): string {
  let text = "";
  for (let i = 0; i + 1 < content.length; i += 2) text += String.fromCharCode((content[i] << 8) | content[i + 1]);
  return text;
}

function utf32be(content: Uint8Array): string {
  let text = "";
  for (let i = 0; i + 3 < content.length; i += 4)
    text += String.fromCodePoint(((content[i] << 24) | (content[i + 1] << 16) | (content[i + 2] << 8) | content[i + 3]) >>> 0);
  return text;
}

export function read_string(node: Asn1Node): string {
  if (node.tag === Asn1Tag.BMP_STRING) return utf16be(node.content);
  if (node.tag === Asn1Tag.UNIVERSAL_STRING) return utf32be(node.content);
  // T61 in practice holds Latin-1; everything else here is ASCII or UTF-8.
  if (node.tag === Asn1Tag.T61_STRING) return new TextDecoder("latin1").decode(node.content);
  return new TextDecoder().decode(node.content);
}

export function read_time(node: Asn1Node): Date {
  const text = new TextDecoder().decode(node.content);
  const match =
    node.tag === Asn1Tag.UTC_TIME
      ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z$/.exec(text)
      : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?(?:\.\d+)?Z$/.exec(text);
  if (!match) throw new Asn1Error(`Unreadable time "${text}"`);
  let year = Number(match[1]);
  // RFC 5280: two-digit years 50–99 are 19xx, 00–49 are 20xx.
  if (node.tag === Asn1Tag.UTC_TIME) year += year >= 50 ? 1900 : 2000;
  return new Date(Date.UTC(year, Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), Number(match[6] ?? 0)));
}

export function hex(bytes: Uint8Array, separator = ""): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(separator);
}
