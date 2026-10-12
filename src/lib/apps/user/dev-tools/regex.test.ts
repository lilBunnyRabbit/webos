import { describe, expect, test } from "vitest";
import { MAX_MATCHES, find_matches, segment_text } from "./regex";

describe("find_matches", () => {
  test("lists every match with numbered and named groups", () => {
    const result = find_matches("(?<key>\\w+)=(\\d+)", "g", "a=1, bb=22");
    expect(result).toEqual({
      ok: true,
      truncated: false,
      matches: [
        {
          index: 0,
          end: 3,
          value: "a=1",
          groups: [
            { name: "1", value: "a" },
            { name: "2", value: "1" },
            { name: "key", value: "a" },
          ],
        },
        {
          index: 5,
          end: 10,
          value: "bb=22",
          groups: [
            { name: "1", value: "bb" },
            { name: "2", value: "22" },
            { name: "key", value: "bb" },
          ],
        },
      ],
    });
  });

  test("without g gives only the first match", () => {
    const result = find_matches("\\d", "", "1 2 3");
    expect(result.ok && result.matches.map((match) => match.value)).toEqual(["1"]);
  });

  test("keeps an unmatched optional group as undefined", () => {
    const result = find_matches("a(b)?", "g", "a");
    expect(result.ok && result.matches[0].groups).toEqual([{ name: "1", value: undefined }]);
  });

  test("steps over empty matches instead of looping", () => {
    const result = find_matches("x*", "g", "ab");
    expect(result.ok && result.matches.map((match) => match.index)).toEqual([0, 1, 2]);
  });

  test("steps over a whole astral code point in unicode mode", () => {
    const result = find_matches("", "gu", "🐰");
    expect(result.ok && result.matches.map((match) => match.index)).toEqual([0, 2]);
  });

  test("stops at the match cap", () => {
    const result = find_matches(".", "g", "a".repeat(MAX_MATCHES + 10));
    expect(result.ok && result.matches.length).toBe(MAX_MATCHES);
    expect(result.ok && result.truncated).toBe(true);
  });

  test("reports an invalid pattern", () => {
    const result = find_matches("(", "g", "x");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Invalid regular expression/);
  });

  test("reports invalid flags", () => {
    expect(find_matches("a", "q", "a").ok).toBe(false);
  });
});

describe("segment_text", () => {
  test("splits text into plain and matched runs", () => {
    const result = find_matches("\\d+", "g", "a12b3");
    if (!result.ok) throw new Error(result.error);
    expect(segment_text("a12b3", result.matches)).toEqual([
      { text: "a", match: null },
      { text: "12", match: 0 },
      { text: "b", match: null },
      { text: "3", match: 1 },
    ]);
  });

  test("drops empty matches", () => {
    const result = find_matches("x*", "g", "ab");
    if (!result.ok) throw new Error(result.error);
    expect(segment_text("ab", result.matches)).toEqual([{ text: "ab", match: null }]);
  });
});
