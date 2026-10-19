import { describe, expect, test } from "vitest";
import { box_rows, clean_lines, is_poor, page_lines, page_score, type OcrWord } from "./lines";
import { vocabulary } from "./snap";
import { GROCERY_WORDS } from "./words";

test("clean_lines keeps the items and drops list decoration", () => {
  const text = ["- mleko", "• 2x kruh", "1. jajca", "2) 500 g moka", "[x] sir", "☐ banane,", "", "  12  ", "Mleko", "* * jogurt"].join("\n");
  expect(clean_lines(text)).toEqual(["mleko", "2x kruh", "jajca", "500 g moka", "sir", "banane", "jogurt"]);
});

test("clean_lines leaves an amount at the start alone", () => {
  expect(clean_lines("1.5 l mleka\r\n2 kg krompirja")).toEqual(["1.5 l mleka", "2 kg krompirja"]);
});

const word = (text: string, confidence: number, left: number): OcrWord => ({ text, confidence, left, right: left + text.length * 20, height: 30 });
const nothing = vocabulary([], []);

describe("page_lines", () => {
  test("splits a line that runs across two columns", () => {
    const page = { lines: [[word("KRUH", 90, 0), word("MLEKO", 90, 400)], [word("G.", 90, 0), word("JOGURT", 90, 50)]] };
    expect(page_lines(page, nothing)).toEqual(["KRUH", "MLEKO", "G. JOGURT"]);
  });

  test("drops unsure words, symbols and lines left with no letters", () => {
    const page = { lines: [[word("SEZAM", 95, 0), word("Tagvei", 4, 120)], [word("|", 90, 0), word("—", 80, 30)], [word("da", 12, 0)]] };
    expect(page_lines(page, nothing)).toEqual(["SEZAM"]);
  });

  test("keeps an unsure word that snaps to a known one, in its known spelling", () => {
    const page = { lines: [[word("ZELENJAVA", 0, 0)], [word("HASLO", 89, 0)]] };
    expect(page_lines(page, vocabulary([], GROCERY_WORDS))).toEqual(["zelenjava", "maslo"]);
  });
});

test("a turned read is poor, an upright one isn't", () => {
  const upright = { lines: [[word("KRUH", 90, 0), word("Peko", 30, 200)]] };
  const turned = { lines: [[word("ZZ", 70, 0), word("Ammr", 10, 100), word("ninnn", 20, 200)]] };
  expect(is_poor(upright)).toBe(false);
  expect(is_poor(turned)).toBe(true);
  expect(page_score(upright)).toBeGreaterThan(page_score(turned));
});

test("box_rows puts boxes on one row together, left to right, and rows top to bottom", () => {
  const box = (text: string, x: number, y: number) => ({ text, confidence: 90, x, y, width: 100, height: 40 });
  const page = box_rows([box("MLEKO", 400, 105), box("KRUH", 0, 100), box("JAJCA", 0, 160), box("MOKA", 400, 150)]);
  expect(page.lines.map((line) => line.map((word) => word.text))).toEqual([["KRUH", "MLEKO"], ["JAJCA", "MOKA"]]);
});
