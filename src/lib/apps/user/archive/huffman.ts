import type { Lz77Token } from "./lz77";

export const MAX_CODE_LENGTH = 15;

// Literals are whole code points here, so the end and length symbols sit above Unicode instead of at 256–285.
export const END_OF_BLOCK = 0x110000;

const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

export const Alphabet = { LITERAL: "literal", DISTANCE: "distance" } as const;
export type Alphabet = (typeof Alphabet)[keyof typeof Alphabet];

export const SymbolKind = { LITERAL: "literal", END: "end", LENGTH: "length", DISTANCE: "distance" } as const;
export type SymbolKind = (typeof SymbolKind)[keyof typeof SymbolKind];

export interface ExtraBits {
  count: number;
  value: number;
}

export interface HuffmanUse {
  alphabet: Alphabet;
  id: number;
  token: number;
  offset: number;
  extra: ExtraBits;
}

export interface HuffmanSymbol {
  id: number;
  kind: SymbolKind;
  deflate: number;
  label: string;
  short: string;
  count: number;
  length: number;
  code: string;
  extra: number;
}

export interface HuffmanTable {
  symbols: HuffmanSymbol[];
  codes: Map<number, string>;
  flat_width: number;
  bits: number;
  flat_bits: number;
}

export interface HuffmanAnalysis {
  uses: HuffmanUse[];
  literal: HuffmanTable;
  distance: HuffmanTable;
  bits: number;
  flat_bits: number;
}

function find_code(base: number[], value: number): number {
  let index = 0;
  while (index + 1 < base.length && base[index + 1] <= value) index++;
  return index;
}

export function length_id(length: number): { id: number; extra: ExtraBits } {
  const index = find_code(LENGTH_BASE, length);
  return { id: END_OF_BLOCK + 1 + index, extra: { count: LENGTH_EXTRA[index], value: length - LENGTH_BASE[index] } };
}

export function distance_id(distance: number): { id: number; extra: ExtraBits } {
  const index = find_code(DISTANCE_BASE, distance);
  return { id: index, extra: { count: DISTANCE_EXTRA[index], value: distance - DISTANCE_BASE[index] } };
}

export function symbol_uses(tokens: Lz77Token[]): HuffmanUse[] {
  const uses: HuffmanUse[] = [];
  const none = { count: 0, value: 0 };
  tokens.forEach((token, index) => {
    if (token.kind === "literal") {
      Array.from(token.text).forEach((char, offset) => {
        uses.push({ alphabet: Alphabet.LITERAL, id: char.codePointAt(0) ?? 0, token: index, offset, extra: none });
      });
      return;
    }
    uses.push({ alphabet: Alphabet.LITERAL, token: index, offset: 0, ...length_id(token.length) });
    uses.push({ alphabet: Alphabet.DISTANCE, token: index, offset: 0, ...distance_id(token.distance) });
  });
  uses.push({ alphabet: Alphabet.LITERAL, id: END_OF_BLOCK, token: tokens.length, offset: 0, extra: none });
  return uses;
}

interface BuildNode {
  weight: number;
  order: number;
  symbols: number[];
}

export function code_lengths(counts: Map<number, number>, limit = MAX_CODE_LENGTH): Map<number, number> {
  const ids = [...counts.keys()].filter((id) => (counts.get(id) ?? 0) > 0).sort((a, b) => a - b);
  const lengths = new Map<number, number>();
  if (ids.length === 0) return lengths;
  // DEFLATE still needs a 1-bit code for a lone symbol.
  if (ids.length === 1) return lengths.set(ids[0], 1);
  if (ids.length > 2 ** limit) throw new Error(`${ids.length} symbols don't fit in ${limit}-bit codes`);

  for (const id of ids) lengths.set(id, 0);
  let order = 0;
  let queue: BuildNode[] = ids.map((id) => ({ weight: counts.get(id) ?? 0, order: order++, symbols: [id] }));
  while (queue.length > 1) {
    queue.sort((a, b) => a.weight - b.weight || a.order - b.order);
    const [a, b] = queue;
    for (const id of [...a.symbols, ...b.symbols]) lengths.set(id, (lengths.get(id) ?? 0) + 1);
    queue = [...queue.slice(2), { weight: a.weight + b.weight, order: order++, symbols: [...a.symbols, ...b.symbols] }];
  }

  return limit_lengths(lengths, counts, limit);
}

// Clamp, then lengthen the cheapest codes until Kraft holds again, then spend any slack on the most used ones.
function limit_lengths(lengths: Map<number, number>, counts: Map<number, number>, limit: number): Map<number, number> {
  if (Math.max(...lengths.values()) <= limit) return lengths;
  const full = 2 ** limit;
  const units = (length: number) => 2 ** (limit - length);
  for (const [id, length] of lengths) lengths.set(id, Math.min(length, limit));

  let total = [...lengths.values()].reduce((sum, length) => sum + units(length), 0);
  const count = (id: number) => counts.get(id) ?? 0;
  while (total > full) {
    let pick: number | null = null;
    for (const [id, length] of lengths) {
      if (length >= limit) continue;
      const best = pick === null ? null : (lengths.get(pick) ?? 0);
      if (best === null || length > best || (length === best && count(id) < count(pick ?? id))) pick = id;
    }
    if (pick === null) break;
    const length = lengths.get(pick) ?? 0;
    total -= units(length + 1);
    lengths.set(pick, length + 1);
  }

  const by_use = [...lengths.keys()].sort((a, b) => count(b) - count(a) || a - b);
  let shortened = true;
  while (shortened) {
    shortened = false;
    for (const id of by_use) {
      const length = lengths.get(id) ?? 0;
      if (length > 1 && total + units(length) <= full) {
        total += units(length);
        lengths.set(id, length - 1);
        shortened = true;
      }
    }
  }
  return lengths;
}

export function kraft_sum(lengths: Map<number, number>): number {
  let sum = 0;
  for (const length of lengths.values()) if (length > 0) sum += 2 ** -length;
  return sum;
}

export function canonical_codes(lengths: Map<number, number>): Map<number, string> {
  const sorted = [...lengths].filter(([, length]) => length > 0).sort(([a, la], [b, lb]) => la - lb || a - b);
  const codes = new Map<number, string>();
  let code = 0;
  let previous = sorted[0]?.[1] ?? 0;
  for (const [id, length] of sorted) {
    code <<= length - previous;
    previous = length;
    codes.set(id, code.toString(2).padStart(length, "0"));
    code++;
  }
  return codes;
}

function show_char(char: string): string {
  if (char === " ") return "␣";
  if (char === "\n") return "↵";
  if (char === "\t") return "⇥";
  if (char === "\r") return "␍";
  const point = char.codePointAt(0) ?? 0;
  if (point < 0x20 || point === 0x7f) return `U+${point.toString(16).toUpperCase().padStart(4, "0")}`;
  return char;
}

function range(base: number, extra: number): { label: string; short: string } {
  const last = base + 2 ** extra - 1;
  return extra ? { label: `${base}–${last}`, short: `${base}+` } : { label: String(base), short: String(base) };
}

export function describe_symbol(alphabet: Alphabet, id: number): Pick<HuffmanSymbol, "kind" | "deflate" | "label" | "short" | "extra"> {
  if (alphabet === Alphabet.DISTANCE) {
    const { label, short } = range(DISTANCE_BASE[id], DISTANCE_EXTRA[id]);
    return { kind: SymbolKind.DISTANCE, deflate: id, label: `back ${label}`, short: `↶${short}`, extra: DISTANCE_EXTRA[id] };
  }
  if (id === END_OF_BLOCK) return { kind: SymbolKind.END, deflate: 256, label: "end of block", short: "end", extra: 0 };
  if (id > END_OF_BLOCK) {
    const index = id - END_OF_BLOCK - 1;
    const { label, short } = range(LENGTH_BASE[index], LENGTH_EXTRA[index]);
    return { kind: SymbolKind.LENGTH, deflate: 257 + index, label: `copy ${label}`, short: `×${short}`, extra: LENGTH_EXTRA[index] };
  }
  const char = String.fromCodePoint(id);
  return { kind: SymbolKind.LITERAL, deflate: id, label: show_char(char), short: show_char(char), extra: 0 };
}

function flat_width(symbols: number): number {
  return symbols === 0 ? 0 : Math.max(1, Math.ceil(Math.log2(symbols)));
}

function table(alphabet: Alphabet, uses: HuffmanUse[]): HuffmanTable {
  const counts = new Map<number, number>();
  for (const use of uses) if (use.alphabet === alphabet) counts.set(use.id, (counts.get(use.id) ?? 0) + 1);
  const lengths = code_lengths(counts);
  const codes = canonical_codes(lengths);
  const width = flat_width(counts.size);
  const symbols = [...counts]
    .map(([id, count]) => ({ id, count, length: lengths.get(id) ?? 0, code: codes.get(id) ?? "", ...describe_symbol(alphabet, id) }))
    .sort((a, b) => b.count - a.count || a.length - b.length || a.id - b.id);
  let bits = 0;
  let flat_bits = 0;
  for (const use of uses) {
    if (use.alphabet !== alphabet) continue;
    bits += (lengths.get(use.id) ?? 0) + use.extra.count;
    flat_bits += width + use.extra.count;
  }
  return { symbols, codes, flat_width: width, bits, flat_bits };
}

export function huffman(tokens: Lz77Token[]): HuffmanAnalysis {
  const uses = symbol_uses(tokens);
  const literal = table(Alphabet.LITERAL, uses);
  const distance = table(Alphabet.DISTANCE, uses);
  return { uses, literal, distance, bits: literal.bits + distance.bits, flat_bits: literal.flat_bits + distance.flat_bits };
}

function extra_bits({ count, value }: ExtraBits): string {
  return count ? value.toString(2).padStart(count, "0") : "";
}

export function use_bits(analysis: HuffmanAnalysis, use: HuffmanUse): string {
  const codes = use.alphabet === Alphabet.LITERAL ? analysis.literal.codes : analysis.distance.codes;
  return (codes.get(use.id) ?? "") + extra_bits(use.extra);
}

export function huffman_encode(analysis: HuffmanAnalysis): string {
  return analysis.uses.map((use) => use_bits(analysis, use)).join("");
}

class BitReader {
  private position = 0;

  constructor(private readonly bits: string) {}

  get done(): boolean {
    return this.position >= this.bits.length;
  }

  number(count: number): number {
    if (this.position + count > this.bits.length) throw new Error("Ran out of bits");
    const value = count ? parseInt(this.bits.slice(this.position, this.position + count), 2) : 0;
    this.position += count;
    return value;
  }

  symbol(codes: Map<string, number>): number {
    let code = "";
    while (code.length < MAX_CODE_LENGTH) {
      if (this.done) throw new Error("Ran out of bits");
      code += this.bits[this.position++];
      const id = codes.get(code);
      if (id !== undefined) return id;
    }
    throw new Error(`No symbol for ${code}`);
  }
}

function invert(codes: Map<number, string>): Map<string, number> {
  return new Map([...codes].map(([id, code]) => [code, id]));
}

export function huffman_decode(bits: string, literal_codes: Map<number, string>, distance_codes: Map<number, string>): string {
  const literal = invert(literal_codes);
  const distance = invert(distance_codes);
  const reader = new BitReader(bits);
  const out: string[] = [];
  for (;;) {
    const id = reader.symbol(literal);
    if (id === END_OF_BLOCK) break;
    if (id < END_OF_BLOCK) {
      out.push(String.fromCodePoint(id));
      continue;
    }
    const index = id - END_OF_BLOCK - 1;
    const length = LENGTH_BASE[index] + reader.number(LENGTH_EXTRA[index]);
    const code = reader.symbol(distance);
    const back = DISTANCE_BASE[code] + reader.number(DISTANCE_EXTRA[code]);
    for (let k = 0; k < length; k++) out.push(out[out.length - back]);
  }
  return out.join("");
}
