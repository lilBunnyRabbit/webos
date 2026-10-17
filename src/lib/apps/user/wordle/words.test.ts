import { describe, expect, it } from "vitest";
import { decode_front, LENGTHS, load_words } from "./words";

describe("decode_front", () => {
  it("rebuilds each word from the shared prefix of the one before", () => {
    expect(decode_front("0aback3ft4i1bed\n")).toEqual(["aback", "abaft", "abafi", "abed"]);
  });
});

describe("load_words", () => {
  it.each(LENGTHS)("loads %i-letter lists of lowercase words that include every answer", async (length) => {
    const words = await load_words(length);
    expect(words.answers.length).toBeGreaterThan(1000);
    expect(words.allowed.size).toBeGreaterThan(words.answers.length);
    expect(new Set(words.answers).size).toBe(words.answers.length);
    for (const word of words.answers) expect(words.allowed.has(word)).toBe(true);
    for (const word of words.allowed) expect(word).toMatch(new RegExp(`^[a-z]{${length}}$`));
  });
});
