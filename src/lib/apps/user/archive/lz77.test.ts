import { describe, expect, it } from "vitest";
import { lz77, lz77_decode, lz77_segments, lz77_stats, source_range } from "./lz77";

describe("lz77_segments", () => {
  it("splits tokens where the active match's source starts and ends", () => {
    const tokens = lz77("xxabcyyabc");
    const match = tokens.find((token) => token.kind === "match");
    if (match?.kind !== "match") throw new Error("expected a match");
    expect(match).toMatchObject({ start: 7, distance: 5, length: 3 });
    expect(lz77_segments(tokens, source_range(match))).toEqual([
      { text: "xx", token: 0, kind: "literal", in_source: false },
      { text: "abc", token: 0, kind: "literal", in_source: true },
      { text: "yy", token: 0, kind: "literal", in_source: false },
      { text: "abc", token: 1, kind: "match", in_source: false },
    ]);
  });

  it("leaves tokens whole without a source", () => {
    expect(lz77_segments(lz77("abcabc")).map((segment) => segment.text)).toEqual(["abc", "abc"]);
  });
});

describe("lz77", () => {
  it("finds a repeat as a back-reference", () => {
    expect(lz77("abcabcabc")).toEqual([
      { kind: "literal", start: 0, text: "abc" },
      { kind: "match", start: 3, length: 6, distance: 3, text: "abcabc" },
    ]);
  });

  it("keeps short repeats as literals", () => {
    expect(lz77("abab")).toEqual([{ kind: "literal", start: 0, text: "abab" }]);
  });

  it("prefers the longest match", () => {
    const tokens = lz77("abcdef1abcxyz2abcdef");
    expect(tokens.find((token) => token.start === 7)).toMatchObject({ kind: "match", length: 3, distance: 7 });
    expect(tokens.find((token) => token.start === 14)).toMatchObject({ kind: "match", length: 6, distance: 14, text: "abcdef" });
  });

  it("respects the window", () => {
    expect(lz77("xyz-----xyz", { window: 4 }).every((token) => token.kind === "literal" || token.distance <= 4)).toBe(true);
  });

  it("counts code points, never splitting an emoji", () => {
    const text = "🐰🐰🐰🐰🐰 ok 🐰🐰🐰";
    const tokens = lz77(text);
    expect(lz77_decode(tokens)).toBe(text);
    expect(lz77_stats(tokens).chars).toBe(Array.from(text).length);
  });

  it("decodes back to the input", () => {
    const samples = ["", "a", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "to be or not to be, that is the question; to be", "na ".repeat(300)];
    for (const sample of samples) expect(lz77_decode(lz77(sample))).toBe(sample);
  });

  it("caps match length", () => {
    const tokens = lz77("a".repeat(600), { max_length: 258 });
    expect(Math.max(...tokens.map((token) => (token.kind === "match" ? token.length : 0)))).toBe(258);
  });

  it("summarizes literals and matches", () => {
    expect(lz77_stats(lz77("abcabcabc"))).toEqual({ literals: 3, matches: 1, matched_chars: 6, chars: 9 });
  });
});
