import { describe, expect, test } from "vitest";
import { Boundary, classify_boundary, orp_index, split_at_orp, split_word, tokenize } from "./tokens";

describe("orp_index", () => {
  test.each([
    ["a", 0],
    ["is", 1],
    ["hello", 1],
    ["reader", 2],
    ["recognize", 2],
    ["optimisation", 3],
    ["internationalization", 4],
  ])("%s → %i", (word, expected) => {
    expect(orp_index(word)).toBe(expected);
  });

  test("skips leading punctuation", () => {
    expect(orp_index("“hello")).toBe(2);
    expect(orp_index("(a)")).toBe(1);
  });

  test("trailing punctuation doesn't count toward the length", () => {
    expect(orp_index("hello,")).toBe(orp_index("hello"));
    expect(orp_index("hello.”")).toBe(1);
  });

  test("punctuation-only word sits in the middle", () => {
    expect(orp_index("—")).toBe(0);
    expect(orp_index("...")).toBe(1);
  });

  test("counts code points, not UTF-16 units", () => {
    expect(orp_index("🙂ok")).toBe(2);
    expect(split_at_orp({ text: "🙂ok", orp: orp_index("🙂ok") })).toEqual(["🙂o", "k", ""]);
  });
});

describe("split_at_orp", () => {
  test("splits around the pivot letter", () => {
    expect(split_at_orp({ text: "reader", orp: 2 })).toEqual(["re", "a", "der"]);
  });
});

describe("classify_boundary", () => {
  test.each([
    ["end.", Boundary.SENTENCE],
    ["what?", Boundary.SENTENCE],
    ["really?!", Boundary.SENTENCE],
    ['said."', Boundary.SENTENCE],
    ["(done.)", Boundary.SENTENCE],
    ["wait...", Boundary.ELLIPSIS],
    ["wait…", Boundary.ELLIPSIS],
    ["ago—", Boundary.DASH],
    ["ago--", Boundary.DASH],
    ["however,", Boundary.COMMA],
    ["this;", Boundary.COMMA],
    ["note:", Boundary.COMMA],
    ["word", Boundary.NONE],
    ["Mr.", Boundary.NONE],
    ["e.g.", Boundary.NONE],
    ["U.S.", Boundary.NONE],
    ["J.", Boundary.NONE],
    ["well-", Boundary.NONE],
  ])("%s → %s", (word, expected) => {
    expect(classify_boundary(word)).toBe(expected);
  });
});

describe("split_word", () => {
  test("splits after an em or en dash joining two words", () => {
    expect(split_word("ago—never")).toEqual(["ago—", "never"]);
    expect(split_word("1990–2000")).toEqual(["1990–", "2000"]);
    expect(split_word("ago--never")).toEqual(["ago--", "never"]);
  });

  test("keeps a trailing or leading dash on its word", () => {
    expect(split_word("ago—")).toEqual(["ago—"]);
    expect(split_word("—never")).toEqual(["—never"]);
  });

  test("keeps short hyphenated words whole", () => {
    expect(split_word("well-known")).toEqual(["well-known"]);
  });

  test("splits long hyphenated words after each hyphen", () => {
    expect(split_word("state-of-the-art")).toEqual(["state-", "of-", "the-", "art"]);
  });

  test("leaves long words without hyphens alone", () => {
    expect(split_word("internationalization")).toEqual(["internationalization"]);
  });
});

describe("tokenize", () => {
  test("splits on any whitespace and keeps punctuation attached", () => {
    expect(tokenize("  Call me\tIshmael.\n").map((token) => token.text)).toEqual(["Call", "me", "Ishmael."]);
  });

  test("marks the word before a blank line as a paragraph end", () => {
    const tokens = tokenize("One two.\n\nThree\nfour");
    expect(tokens.map((token) => token.paragraph)).toEqual([false, true, false, false]);
  });

  test("a spaced dash joins the word before it", () => {
    const tokens = tokenize("ago — never");
    expect(tokens.map((token) => token.text)).toEqual(["ago —", "never"]);
    expect(tokens[0].boundary).toBe(Boundary.DASH);
  });

  test("an em dash between words gives two tokens with a dash pause", () => {
    const tokens = tokenize("ago—never mind");
    expect(tokens.map((token) => [token.text, token.boundary])).toEqual([
      ["ago—", Boundary.DASH],
      ["never", Boundary.NONE],
      ["mind", Boundary.NONE],
    ]);
  });

  test("counts letters without punctuation", () => {
    expect(tokenize("“Hello,”")[0].letters).toBe(5);
  });

  test("empty and whitespace-only text has no tokens", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(" \n\t ")).toEqual([]);
  });
});
