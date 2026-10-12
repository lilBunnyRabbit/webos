import { describe, expect, test } from "vitest";
import { Boundary, classify_boundary, count_sentences, tokenize } from "./tokens";

describe("classify_boundary", () => {
  test.each([
    ["end.", Boundary.SENTENCE],
    ["what?", Boundary.SENTENCE],
    ["really?!", Boundary.SENTENCE],
    ['said."', Boundary.SENTENCE],
    ["gone?’", Boundary.SENTENCE],
    ["(done.)", Boundary.SENTENCE],
    ["wait...", Boundary.ELLIPSIS],
    ["wait…", Boundary.ELLIPSIS],
    ["ago—", Boundary.DASH],
    ["ago--", Boundary.DASH],
    ["—", Boundary.DASH],
    ["however,", Boundary.COMMA],
    ["this;", Boundary.COMMA],
    ["note:", Boundary.COMMA],
    ["word", Boundary.NONE],
    ["Mr.", Boundary.NONE],
    ["Dr.", Boundary.NONE],
    ["e.g.", Boundary.NONE],
    ["U.S.", Boundary.NONE],
    ["J.", Boundary.NONE],
    ["well-", Boundary.NONE],
    ["”", Boundary.NONE],
  ])("%s → %s", (word, expected) => {
    expect(classify_boundary(word)).toBe(expected);
  });
});

describe("tokenize", () => {
  test("splits on any whitespace and keeps punctuation attached", () => {
    expect(tokenize("  Call me\tIshmael.\n").map((token) => token.text)).toEqual(["Call", "me", "Ishmael."]);
  });

  test("keeps dashed and hyphenated words whole, and a spaced dash as its own word", () => {
    expect(tokenize("state-of-the-art ago—never ago — never").map((token) => token.text)).toEqual([
      "state-of-the-art",
      "ago—never",
      "ago",
      "—",
      "never",
    ]);
  });

  test("classifies each word", () => {
    expect(tokenize("Hi, you. Bye").map((token) => token.boundary)).toEqual([
      Boundary.COMMA,
      Boundary.SENTENCE,
      Boundary.NONE,
    ]);
  });

  test("empty and whitespace-only text has no tokens", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(" \n\t ")).toEqual([]);
  });
});

describe("count_sentences", () => {
  test("counts sentence ends, not abbreviations", () => {
    expect(count_sentences(tokenize("Dr. No left. Then? Fine"))).toBe(2);
    expect(count_sentences(tokenize("no end"))).toBe(0);
  });
});
