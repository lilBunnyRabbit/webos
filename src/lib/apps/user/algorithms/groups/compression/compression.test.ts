import { describe, expect, test } from "vitest";
import { default_params, record, type Definition } from "../../engine/definition";
import compression, { inverse_bwt } from "./index";
import { huffman_codes } from "../trees/forests";
import { bin_to_dict, decode_from_bin, dict_to_bin, dict_to_string, lz77_decode, lz77_encode } from "./lz77";

const run = <R>(id: string, input: string, params: Record<string, number | string> = {}) => {
  const definition = compression[id] as Definition<string, R>;
  const recording = record(definition, input, { ...default_params(definition.params), ...params });
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

const random_text = (length: number, alphabet = "aab c") => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

describe("LZ77 (the owner's gist)", () => {
  test("round-trips through triples and through binary", () => {
    for (let round = 0; round < 100; round++) {
      const data = random_text(1 + Math.floor(Math.random() * 60));
      for (const [search, look] of [
        [255, 255],
        [4, 3],
        [1, 1],
        [16, 255],
      ]) {
        const dict = lz77_encode(data, search, look);
        expect(lz77_decode(dict)).toBe(data);
        expect(decode_from_bin(dict_to_bin(dict))).toBe(data);
        expect(bin_to_dict(dict_to_bin(dict))).toEqual(dict);
        for (const [distance, length] of dict) {
          expect(distance).toBeLessThanOrEqual(search);
          expect(length).toBeLessThanOrEqual(look);
        }
      }
    }
  });

  test("a match that runs to the end of the look-ahead is kept (the gist dropped it)", () => {
    expect(lz77_encode("aaaa")).toEqual([
      [0, 0, "a"],
      [1, 2, "a"],
    ]);
    expect(dict_to_string(lz77_encode("abababab"))).toBe("(0, 0, a)(0, 0, b)(2, 5, b)");
  });

  test("overlapping copies decode", () => {
    expect(lz77_decode([[0, 0, "a"], [1, 9, "b"]])).toBe("aaaaaaaaaab");
  });

  test("the binary header says how many bytes each value takes", () => {
    expect(dict_to_bin(lz77_encode("ab")).slice(0, 2)).toBe("01");
    expect(dict_to_bin(lz77_encode("č")).slice(0, 2)).toBe("10");
  });

  test("the visualiser returns what it shows", () => {
    for (let round = 0; round < 30; round++) {
      const data = random_text(30);
      const result = run<{ dict: [number, number, string][]; decoded: string }>("lz77", data, { search: 8, look: 6 });
      expect(result.decoded).toBe(data);
      expect(result.dict).toEqual(lz77_encode(data, 8, 6));
    }
  });
});

describe("other coders round-trip", () => {
  test("run-length encoding", () => {
    expect(run<{ encoded: string }>("rle", "aaaabbbccccccd").encoded).toBe("4a3b6c1d");
  });

  test("LZ78 and LZW decode to the input", () => {
    for (let round = 0; round < 40; round++) {
      const data = random_text(1 + Math.floor(Math.random() * 50), "ab");
      expect(run<{ decoded: string }>("lz78", data).decoded).toBe(data);
      expect(run<{ decoded: string }>("lzw", data).decoded).toBe(data);
    }
  });

  test("LZW's classic example", () => {
    expect(run<{ codes: number[] }>("lzw", "TOBEORNOTTOBEORTOBEORNOT").codes.length).toBe(16);
  });

  test("BWT of banana, and its inverse", () => {
    const result = run<{ last: string; original: string }>("bwt-mtf", "banana");
    expect(result.last).toBe("annb$aa");
    expect(result.original).toBe("banana");
    for (let round = 0; round < 30; round++) {
      const data = random_text(1 + Math.floor(Math.random() * 18), "abn");
      expect(run<{ original: string }>("bwt-mtf", data).original).toBe(data);
    }
  });

  test("BWT refuses the end marker", () => {
    expect(() => compression["bwt-mtf"].input.parse("a$b")).toThrow("$");
  });

  test("Base64 matches the platform", () => {
    for (const data of ["Hi WebOS!", "a", "ab", "abc", "čšž ✓", ""]) {
      if (!data) continue;
      const expected = btoa(String.fromCharCode(...new TextEncoder().encode(data)));
      expect(run<{ encoded: string }>("base64", data).encoded).toBe(expected);
    }
  });

  test("BWT inverse helper", () => {
    expect(inverse_bwt("ipssm$pissii")).toBe("mississippi");
  });
});

describe("Huffman coding", () => {
  test("the bit stream uses the tree's codes and decodes back", () => {
    for (let round = 0; round < 60; round++) {
      const data = random_text(1 + Math.floor(Math.random() * 60), round % 4 ? "aaab c\n" : "z");
      const codes = huffman_codes(data);
      const result = run<{ bits: string; bytes: number[]; decoded: string }>("huffman-coding", data);
      expect(result.bits).toBe([...data].map((char) => codes.get(char)).join(""));
      expect(result.decoded).toBe(data);
      expect(result.bytes).toHaveLength(Math.ceil(result.bits.length / 8));
    }
  });
});

describe("arithmetic coding", () => {
  test("decodes back, within a bit of the information content and of Huffman", () => {
    for (let round = 0; round < 60; round++) {
      const data = random_text(1 + Math.floor(Math.random() * 32), round % 4 ? "aaab c" : "z");
      const result = run<{ bits: string; decoded: string }>("arithmetic-coding", data);
      expect(result.decoded).toBe(data);
      const counts = new Map<string, number>();
      for (const char of data) counts.set(char, (counts.get(char) ?? 0) + 1);
      const information = [...data].reduce((sum, char) => sum - Math.log2(counts.get(char)! / data.length), 0);
      expect(result.bits.length).toBeLessThanOrEqual(Math.ceil(information + 1e-9) + 1);
      const codes = huffman_codes(data);
      expect(result.bits.length).toBeLessThanOrEqual([...data].reduce((sum, char) => sum + codes.get(char)!.length, 0) + 1);
    }
  });

  test("abracadabra", () => {
    const result = run<{ bits: string; decoded: string }>("arithmetic-coding", "abracadabra");
    expect(result.decoded).toBe("abracadabra");
    expect(result.bits.length).toBeLessThan(23);
  });
});

describe("samples and presets run", () => {
  for (const [id, definition] of Object.entries(compression)) {
    test(id, () => {
      for (const input of [definition.input.sample, ...(definition.presets ?? []).map((preset) => preset.value), ...Array.from({ length: 5 }, () => definition.input.random())]) {
        run(id, input as string);
      }
    });
  }
});
