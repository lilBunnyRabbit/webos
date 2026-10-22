import { describe, expect, it } from "vitest";
import { check_form, is_checkable, misspelt, spell_words } from "./spelling";
import { clean_help } from "./writing-help";

describe("spelling words", () => {
  it("counts each word as written, hyphens splitting, apostrophes joining", () => {
    const words = spell_words("Teh quick well-knwn fox don’t teh, 3rd CV x Teh");
    expect([...words]).toEqual([
      ["Teh", 2],
      ["quick", 1],
      ["well", 1],
      ["knwn", 1],
      ["fox", 1],
      ["don’t", 1],
      ["teh", 1],
    ]);
  });

  it("skips numbers, single letters and acronyms", () => {
    expect(["a", "3rd", "CV", "PDF", "Ok", "ok"].map(is_checkable)).toEqual([false, false, false, false, true, true]);
    expect(check_form("don’t")).toBe("don't");
  });

  it("lists wrong words once per spelling, ignoring case, minus the ignored ones", () => {
    const counts = spell_words("Teh fox, teh dog, Warren and knwn");
    const wrong = new Set(["Teh", "teh", "Warren", "knwn"]);
    expect(misspelt(counts, (form) => wrong.has(form), new Set(["warren"]))).toEqual([
      { word: "Teh", count: 2 },
      { word: "knwn", count: 1 },
    ]);
  });
});

describe("writing help", () => {
  it("drops a lead-in line and wrapping quotes", () => {
    expect(clean_help("Here is the shorter text:\nWe ship it.")).toBe("We ship it.");
    expect(clean_help("“We ship it.”")).toBe("We ship it.");
    expect(clean_help(`"She said "yes" twice."`)).toBe(`"She said "yes" twice."`);
  });
});
