export const Mode = { NUMERIC: "numeric", ALPHANUMERIC: "alphanumeric", BYTE: "byte", ECI: "eci" } as const;
export type Mode = (typeof Mode)[keyof typeof Mode];

export const MODE_INDICATOR: Record<Mode, number> = { numeric: 0b0001, alphanumeric: 0b0010, byte: 0b0100, eci: 0b0111 };

const COUNT_BITS: Record<Mode, [number, number, number]> = {
  numeric: [10, 12, 14],
  alphanumeric: [9, 11, 13],
  byte: [8, 16, 16],
  eci: [0, 0, 0],
};

export const ALPHANUMERIC_CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export const Charset = { UTF8: "utf-8", LATIN2: "iso-8859-2" } as const;
export type Charset = (typeof Charset)[keyof typeof Charset];

export const ECI_LATIN2 = 4;

export interface Segment {
  mode: Mode;
  /** Characters for numeric and alphanumeric, bytes for byte mode, the assignment number for ECI. */
  count: number;
  bits: number[];
  text: string;
}

export function count_bits(mode: Mode, version: number): number {
  return COUNT_BITS[mode][version <= 9 ? 0 : version <= 26 ? 1 : 2];
}

export function push_bits(out: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i--) out.push((value >>> i) & 1);
}

export const is_numeric = (text: string) => /^[0-9]*$/.test(text);
export const is_alphanumeric = (text: string) => [...text].every((char) => ALPHANUMERIC_CHARSET.includes(char));

export function numeric_segment(digits: string): Segment {
  const bits: number[] = [];
  for (let i = 0; i < digits.length; i += 3) {
    const group = digits.slice(i, i + 3);
    push_bits(bits, Number(group), group.length * 3 + 1);
  }
  return { mode: Mode.NUMERIC, count: digits.length, bits, text: digits };
}

export function alphanumeric_segment(text: string): Segment {
  const bits: number[] = [];
  for (let i = 0; i + 1 < text.length; i += 2)
    push_bits(bits, ALPHANUMERIC_CHARSET.indexOf(text[i]) * 45 + ALPHANUMERIC_CHARSET.indexOf(text[i + 1]), 11);
  if (text.length % 2) push_bits(bits, ALPHANUMERIC_CHARSET.indexOf(text[text.length - 1]), 6);
  return { mode: Mode.ALPHANUMERIC, count: text.length, bits, text };
}

export function byte_segment(bytes: Uint8Array, text: string): Segment {
  const bits: number[] = [];
  for (const byte of bytes) push_bits(bits, byte, 8);
  return { mode: Mode.BYTE, count: bytes.length, bits, text };
}

export function eci_segment(assignment: number): Segment {
  const bits: number[] = [];
  if (assignment < 1 << 7) push_bits(bits, assignment, 8);
  else if (assignment < 1 << 14) push_bits(bits, 0b10_000000_00000000 | assignment, 16);
  else push_bits(bits, 0b110_00000_00000000_00000000 | assignment, 24);
  return { mode: Mode.ECI, count: assignment, bits, text: "" };
}

// ISO 8859-2 from 0xA0: ASCII and the C1 controls map to themselves.
const LATIN2_HIGH =
  " Ą˘Ł¤ĽŚ§¨ŠŞŤŹ­ŽŻ°ą˛ł´ľśˇ¸šşťź˝žżŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢßŕáâăäĺćçčéęëěíîďđńňóôőö÷řůúűüýţ˙";

export function encode_latin2(text: string): Uint8Array {
  return Uint8Array.from(text, (char) => {
    const code = char.codePointAt(0)!;
    if (code < 0xa0) return code;
    const index = LATIN2_HIGH.indexOf(char);
    return index < 0 ? 0x3f : 0xa0 + index;
  });
}

export function is_latin2(text: string): boolean {
  return [...text].every((char) => char.codePointAt(0)! < 0xa0 || LATIN2_HIGH.includes(char));
}

const utf8 = new TextEncoder();

export function single_segments(text: string): Segment[] {
  if (text === "") return [];
  if (is_numeric(text)) return [numeric_segment(text)];
  if (is_alphanumeric(text)) return [alphanumeric_segment(text)];
  return [byte_segment(utf8.encode(text), text)];
}

export function latin2_segments(text: string): Segment[] {
  return [eci_segment(ECI_LATIN2), byte_segment(encode_latin2(text), text)];
}

export function segment_bits(segments: readonly Segment[], version: number): number {
  let total = 0;
  for (const segment of segments) {
    const width = count_bits(segment.mode, version);
    if (segment.mode !== Mode.ECI && segment.count >= 2 ** width) return Infinity;
    total += 4 + width + segment.bits.length;
  }
  return total;
}

const MODES = [Mode.BYTE, Mode.ALPHANUMERIC, Mode.NUMERIC] as const;
type TextMode = (typeof MODES)[number];

// In sixths of a bit: a digit costs 10/3 bits, an alphanumeric character 11/2.
const CHAR_COST: Record<TextMode, (char: string) => number | null> = {
  byte: (char) => utf8.encode(char).length * 8 * 6,
  alphanumeric: (char) => (ALPHANUMERIC_CHARSET.includes(char) ? 33 : null),
  numeric: (char) => (char >= "0" && char <= "9" ? 20 : null),
};

export function optimal_segments(text: string, version: number): Segment[] {
  const chars = [...text];
  if (chars.length === 0) return [];
  const head = MODES.map((mode) => (4 + count_bits(mode, version)) * 6);
  const from: (TextMode | null)[][] = [];
  let costs = head.slice();

  for (const char of chars) {
    const next: number[] = [Infinity, Infinity, Infinity];
    const via: (TextMode | null)[] = [null, null, null];
    MODES.forEach((mode, i) => {
      const cost = CHAR_COST[mode](char);
      if (cost === null) return;
      next[i] = costs[i] + cost;
      via[i] = mode;
    });
    const settled = next.slice();
    MODES.forEach((_, to) => {
      MODES.forEach((mode, k) => {
        if (via[k] === null) return;
        const switched = Math.ceil(next[k] / 6) * 6 + head[to];
        if (via[to] === null || switched < settled[to]) {
          settled[to] = switched;
          via[to] = mode;
        }
      });
    });
    from.push(via);
    costs = settled;
  }

  let mode: TextMode | null = MODES[costs.indexOf(Math.min(...costs))];
  const modes: TextMode[] = new Array(chars.length);
  for (let i = chars.length - 1; i >= 0; i--) {
    mode = from[i][MODES.indexOf(mode!)];
    modes[i] = mode!;
  }

  const out: Segment[] = [];
  let start = 0;
  for (let i = 1; i <= chars.length; i++) {
    if (i < chars.length && modes[i] === modes[start]) continue;
    const run = chars.slice(start, i).join("");
    if (modes[start] === Mode.NUMERIC) out.push(numeric_segment(run));
    else if (modes[start] === Mode.ALPHANUMERIC) out.push(alphanumeric_segment(run));
    else out.push(byte_segment(utf8.encode(run), run));
    start = i;
  }
  return out;
}
