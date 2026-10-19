import { describe, expect, test } from "vitest";
import { entry_text, format_amount, parse_entry } from "./parse";

describe("parse_entry", () => {
  test.each([
    ["mleko", { text: "mleko" }],
    ["2x mleko", { text: "mleko", qty: 2 }],
    ["2 x mleko", { text: "mleko", qty: 2 }],
    ["3× jogurt", { text: "jogurt", qty: 3 }],
    ["500 g moka", { text: "moka", qty: 500, unit: "g" }],
    ["500g moka", { text: "moka", qty: 500, unit: "g" }],
    ["1,5 l mleka", { text: "mleka", qty: 1.5, unit: "l" }],
    ["0.5 KG sira", { text: "sira", qty: 0.5, unit: "kg" }],
    ["10 jajc", { text: "jajc", qty: 10 }],
    ["mleko 2", { text: "mleko", qty: 2 }],
    ["mleko 2x", { text: "mleko", qty: 2 }],
    ["jajca x10", { text: "jajca", qty: 10 }],
    ["moka 500 g", { text: "moka", qty: 500, unit: "g" }],
    ["coca cola 2 l", { text: "coca cola", qty: 2, unit: "l" }],
    ["  2x   rženi   kruh ", { text: "rženi kruh", qty: 2 }],
  ])("%s", (input, expected) => {
    expect(parse_entry(input)).toEqual(expected);
  });

  test("a unit letter that starts a word stays part of the word", () => {
    expect(parse_entry("2 gala jabolki")).toEqual({ text: "gala jabolki", qty: 2 });
    expect(parse_entry("3 limone")).toEqual({ text: "limone", qty: 3 });
  });

  test("numbers that are part of the name stay", () => {
    expect(parse_entry("7up")).toEqual({ text: "7up" });
    expect(parse_entry("2")).toEqual({ text: "2" });
    expect(parse_entry("0 mleko")).toEqual({ text: "0 mleko" });
  });
});

describe("format_amount and entry_text", () => {
  test("show the amount the way it was typed, with a decimal comma", () => {
    expect(format_amount({ qty: 2 })).toBe("2×");
    expect(format_amount({ qty: 1.5, unit: "l" })).toBe("1,5 l");
    expect(format_amount({})).toBe("");
  });

  test("entry_text parses back to the same entry", () => {
    for (const entry of [{ text: "mleko" }, { text: "mleko", qty: 2 }, { text: "moka", qty: 0.5, unit: "kg" }]) {
      expect(parse_entry(entry_text(entry))).toEqual(entry);
    }
  });
});
