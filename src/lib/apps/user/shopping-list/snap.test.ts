import { describe, expect, test } from "vitest";
import { allowed_distance, edit_distance, fold, match_word, snap_line, vocabulary } from "./snap";
import { GROCERY_WORDS } from "./words";

const built_in = vocabulary([], GROCERY_WORDS);

describe("edit_distance", () => {
  test("counts a swap of neighbours as one edit", () => {
    expect(edit_distance("maslo", "masol")).toBe(1);
    expect(edit_distance("kruh", "kruh")).toBe(0);
    expect(edit_distance("toka", "moka")).toBe(1);
    expect(edit_distance("zeleaava", "zelenjava")).toBe(2);
    expect(edit_distance("", "sol")).toBe(3);
  });
});

test("fold drops case and diacritics", () => {
  expect(fold("RIŽ")).toBe("riz");
  expect(fold("Palčke Đuveč")).toBe("palcke duvec");
});

test("allowed_distance grows with the word", () => {
  expect([3, 4, 5, 6, 9].map(allowed_distance)).toEqual([0, 1, 1, 2, 2]);
});

describe("match_word", () => {
  test("snaps handwriting misreads to the dictionary spelling in lower case", () => {
    expect(match_word("TOKA", built_in)).toBe("moka");
    expect(match_word("HASLO", built_in)).toBe("maslo");
    expect(match_word("ZELEAAVA", built_in)).toBe("zelenjava");
    expect(match_word("KARTUSE", built_in)).toBe("kartuše");
  });

  test("restores diacritics on short words but never guesses one", () => {
    expect(match_word("RIZ", built_in)).toBe("riž");
    expect(match_word("SAK", built_in)).toBeNull();
  });

  test("ignores the punctuation around a word and words with digits", () => {
    expect(match_word("PALČKE.", built_in)).toBe("palčke");
    expect(match_word("2x", built_in)).toBeNull();
    expect(match_word("3", built_in)).toBeNull();
    expect(match_word("—", built_in)).toBeNull();
  });

  test("reads digits a reader gave for letters", () => {
    expect(match_word("2ELENJAVA", built_in)).toBe("zelenjava");
    expect(match_word("2A", built_in)).toBe("za");
    expect(match_word("S0JINA", built_in)).toBe("sojina");
    expect(match_word("M1EKO", built_in)).toBe("mleko");
    expect(match_word("500", built_in)).toBeNull();
  });

  test("leaves words with nothing close as they are", () => {
    expect(match_word("KANALETA", built_in)).toBeNull();
  });

  test("asks the history first", () => {
    const own = vocabulary(["kanaleta", "moke"], GROCERY_WORDS);
    expect(match_word("KANALETO", own)).toBe("kanaleta");
    expect(match_word("TOKE", own)).toBe("moke");
  });

  test("trusts neither of two equally close words", () => {
    expect(match_word("ZODA", vocabulary([], ["voda", "soda"]))).toBeNull();
    expect(match_word("ZODA", vocabulary(["soda"], ["voda"]))).toBe("soda");
  });
});

describe("snap_line", () => {
  test("snaps each word and keeps the rest", () => {
    expect(snap_line("OMEGA 3", built_in)).toBe("omega 3");
    expect(snap_line("G. JOGURTT", built_in)).toBe("G. jogurt");
  });

  test("matches a whole line to a history entry of several words", () => {
    const own = vocabulary(["palčke za ušesa", "g. jogurt"], GROCERY_WORDS);
    expect(snap_line("PALCKE ZA USESA", own)).toBe("palčke za ušesa");
    expect(snap_line("G. JOGRUT", own)).toBe("g. jogurt");
  });
});

test("the built-in list has about 500 distinct words", () => {
  expect(new Set(GROCERY_WORDS).size).toBe(GROCERY_WORDS.length);
  expect(GROCERY_WORDS.length).toBeGreaterThan(450);
});
