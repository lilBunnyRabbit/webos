import { expect, test } from "vitest";
import { clean_lines } from "./lines";

test("clean_lines keeps the items and drops list decoration", () => {
  const text = ["- mleko", "• 2x kruh", "1. jajca", "2) 500 g moka", "[x] sir", "☐ banane,", "", "  12  ", "Mleko", "* * jogurt"].join("\n");
  expect(clean_lines(text)).toEqual(["mleko", "2x kruh", "jajca", "500 g moka", "sir", "banane", "jogurt"]);
});

test("clean_lines leaves an amount at the start alone", () => {
  expect(clean_lines("1.5 l mleka\r\n2 kg krompirja")).toEqual(["1.5 l mleka", "2 kg krompirja"]);
});
