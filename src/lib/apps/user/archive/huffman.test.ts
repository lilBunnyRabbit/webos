import { describe, expect, it } from "vitest";
import { lz77 } from "./lz77";
import {
  Alphabet,
  END_OF_BLOCK,
  MAX_CODE_LENGTH,
  canonical_codes,
  code_lengths,
  distance_id,
  huffman,
  huffman_decode,
  huffman_encode,
  kraft_sum,
  length_id,
} from "./huffman";

function fibonacci(count: number): Map<number, number> {
  const counts = new Map<number, number>();
  let [a, b] = [1, 1];
  for (let id = 0; id < count; id++) {
    counts.set(id, a);
    [a, b] = [b, a + b];
  }
  return counts;
}

describe("code_lengths", () => {
  it("gives common symbols shorter codes", () => {
    const lengths = code_lengths(
      new Map([
        [1, 50],
        [2, 20],
        [3, 20],
        [4, 5],
        [5, 5],
      ])
    );
    expect(lengths.get(1)).toBe(1);
    expect(lengths.get(4)).toBeGreaterThan(lengths.get(2) ?? 0);
    expect(kraft_sum(lengths)).toBe(1);
  });

  it("gives a lone symbol one bit and nothing to an empty alphabet", () => {
    expect(code_lengths(new Map([[7, 3]]))).toEqual(new Map([[7, 1]]));
    expect(code_lengths(new Map())).toEqual(new Map());
  });

  it("satisfies Kraft for every input", () => {
    for (const size of [2, 3, 5, 17, 64, 200]) {
      const counts = new Map(Array.from({ length: size }, (_, id) => [id, 1 + ((id * 7919) % 97)]));
      expect(kraft_sum(code_lengths(counts))).toBe(1);
    }
  });

  it("limits codes to 15 bits when Huffman would go deeper", () => {
    const counts = fibonacci(30);
    expect(Math.max(...code_lengths(counts, 64).values())).toBeGreaterThan(MAX_CODE_LENGTH);
    const limited = code_lengths(counts);
    expect(Math.max(...limited.values())).toBe(MAX_CODE_LENGTH);
    expect(kraft_sum(limited)).toBe(1);
  });

  it("keeps the most used symbols shortest under the limit", () => {
    const counts = fibonacci(30);
    const limited = code_lengths(counts);
    for (let id = 1; id < 30; id++) expect(limited.get(id) ?? 0).toBeLessThanOrEqual(limited.get(id - 1) ?? 0);
  });

  it("limits to a tighter cap too", () => {
    const limited = code_lengths(fibonacci(12), 5);
    expect(Math.max(...limited.values())).toBeLessThanOrEqual(5);
    expect(kraft_sum(limited)).toBeLessThanOrEqual(1);
  });
});

describe("canonical_codes", () => {
  it("matches the RFC 1951 example", () => {
    const lengths = new Map([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
      [4, 3],
      [5, 2],
      [6, 4],
      [7, 4],
    ]);
    const codes = canonical_codes(lengths);
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((id) => codes.get(id))).toEqual(["010", "011", "100", "101", "110", "00", "1110", "1111"]);
  });

  it("produces a prefix-free code", () => {
    const codes = [...canonical_codes(code_lengths(fibonacci(25))).values()];
    for (const a of codes) for (const b of codes) if (a !== b) expect(b.startsWith(a)).toBe(false);
  });
});

describe("length and distance symbols", () => {
  it("maps to DEFLATE's codes and extra bits", () => {
    expect(length_id(3)).toEqual({ id: END_OF_BLOCK + 1, extra: { count: 0, value: 0 } });
    expect(length_id(12)).toEqual({ id: END_OF_BLOCK + 1 + 8, extra: { count: 1, value: 1 } });
    expect(length_id(258)).toEqual({ id: END_OF_BLOCK + 1 + 28, extra: { count: 0, value: 0 } });
    expect(distance_id(1)).toEqual({ id: 0, extra: { count: 0, value: 0 } });
    expect(distance_id(24)).toEqual({ id: 8, extra: { count: 3, value: 7 } });
    expect(distance_id(32768)).toEqual({ id: 29, extra: { count: 13, value: 8191 } });
  });
});

describe("huffman", () => {
  const samples = [
    "",
    "a",
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "How much wood would a woodchuck chuck if a woodchuck could chuck wood?",
    "🐰🐰🐰 hop 🐰 hop hop\n\tdone",
    "na ".repeat(300),
    Array.from({ length: 3000 }, (_, i) => String.fromCharCode(32 + ((i * i * 31) % 90))).join(""),
  ];

  it("round-trips the token stream through the bits", () => {
    for (const text of samples) {
      const analysis = huffman(lz77(text));
      const bits = huffman_encode(analysis);
      expect(bits.length).toBe(analysis.bits);
      expect(huffman_decode(bits, analysis.literal.codes, analysis.distance.codes)).toBe(text);
    }
  });

  it("ends every block and counts every use", () => {
    const analysis = huffman(lz77("abcabcabc"));
    expect(analysis.uses.at(-1)).toMatchObject({ alphabet: Alphabet.LITERAL, id: END_OF_BLOCK });
    expect(analysis.literal.symbols.reduce((sum, symbol) => sum + symbol.count, 0)).toBe(5);
    expect(analysis.distance.symbols).toMatchObject([{ id: 2, count: 1, label: "back 3", code: "0" }]);
  });

  it("never costs more than the same tokens in equal-length codes", () => {
    for (const text of samples) {
      const analysis = huffman(lz77(text));
      expect(analysis.bits).toBeLessThanOrEqual(analysis.flat_bits);
    }
  });
});
