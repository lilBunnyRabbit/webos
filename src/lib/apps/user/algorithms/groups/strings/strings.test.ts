import { describe, expect, test } from "vitest";
import { default_params, record, type Definition } from "../../engine/definition";
import strings, { failure_table, matches_of, z_array, type Pair } from "./index";

const run = <R>(id: string, input: unknown, params: Record<string, number | string> = {}) => {
  const definition = strings[id] as Definition<unknown, R>;
  const recording = record(definition, input, { ...default_params(definition.params), ...params });
  expect(recording.truncated).toBe(false);
  for (const step of recording.steps) expect(step.note.length).toBeGreaterThan(0);
  return recording.result as R;
};

const random_text = (length: number, alphabet = "ab") => Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

describe("every search finds every occurrence, overlaps included", () => {
  for (const id of ["naive-search", "kmp", "boyer-moore", "rabin-karp", "z-algorithm"]) {
    test(id, () => {
      for (let round = 0; round < 60; round++) {
        const pair: Pair = { a: random_text(1 + Math.floor(Math.random() * 4)), b: random_text(5 + Math.floor(Math.random() * 30)) };
        expect(run<{ found: number[] }>(id, pair).found).toEqual(matches_of(pair.b, pair.a));
      }
    });
  }

  test("Rabin–Karp counts spurious hits with a tiny modulus", () => {
    const result = run<{ found: number[]; spurious: number }>("rabin-karp", { a: "abc", b: "abcbcaacbabcacbbacab" }, { modulus: 3 });
    expect(result.found).toEqual(matches_of("abcbcaacbabcacbbacab", "abc"));
    expect(result.spurious).toBeGreaterThan(0);
  });
});

describe("tables", () => {
  test("KMP failure table", () => {
    expect(failure_table("ababaca")).toEqual([0, 0, 1, 2, 3, 0, 1]);
    expect(failure_table("aaaa")).toEqual([0, 1, 2, 3]);
  });

  test("Z-array", () => {
    expect(z_array("aabcaabxaaaz")).toEqual([0, 1, 0, 0, 3, 1, 0, 0, 2, 2, 1, 0]);
  });
});

describe("edit distance", () => {
  test("kitten to sitting is 3", () => {
    expect(run<{ distance: number; edits: string[] }>("edit-distance", { a: "kitten", b: "sitting" })).toEqual({
      distance: 3,
      edits: ["replace k with s", "replace e with i", "insert g"],
    });
  });

  test("matches a reference, and the edits count equals the distance", () => {
    for (let round = 0; round < 50; round++) {
      const a = random_text(1 + Math.floor(Math.random() * 8), "abc");
      const b = random_text(1 + Math.floor(Math.random() * 8), "abc");
      const result = run<{ distance: number; edits: string[] }>("edit-distance", { a, b });
      expect(result.distance).toBe(levenshtein(a, b));
      expect(result.edits.length).toBe(result.distance);
    }
  });
});

describe("suffix array", () => {
  test("banana", () => {
    expect(run<{ sa: number[]; lcp: number[] }>("suffix-array", "banana")).toEqual({ sa: [5, 3, 1, 0, 4, 2], lcp: [0, 1, 3, 0, 0, 2] });
  });
});

describe("inputs", () => {
  test("pattern | text parses and checks", () => {
    expect(strings.kmp.input.parse("ab | xxabx")).toEqual({ a: "ab", b: "xxabx" });
    expect(() => strings.kmp.input.parse("no separator")).toThrow("|");
  });

  for (const [id, definition] of Object.entries(strings)) {
    test(`${id}: samples and random inputs run`, () => {
      for (const input of [definition.input.sample, ...(definition.presets ?? []).map((preset) => preset.value), ...Array.from({ length: 5 }, () => definition.input.random())]) {
        expect(() => definition.input.parse(definition.input.format(input))).not.toThrow();
        run(id, input);
      }
    });
  }
});
