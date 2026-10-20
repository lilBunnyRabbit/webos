import { expect, test } from "vitest";
import { CHAR_SETS, CharSet, project_characters, set_characters } from "./charsets";
import { COLUMNS, PAGE, template_layout } from "./template";

test("every set fits one template sheet, once per character, inside the BMP", () => {
  for (const set of CHAR_SETS) {
    const chars = set_characters(set);
    expect(chars.length).toBeLessThanOrEqual(COLUMNS * 10);
    expect(new Set(chars).size).toBe(chars.length);
    for (const char of chars) expect(char.codePointAt(0)!).toBeLessThan(0xffff);
    const last = template_layout(set).boxes.at(-1)!;
    expect(last.y + last.height).toBeLessThan(PAGE.height - 18);
  }
});

test("picked sets merge without repeats", () => {
  const merged = project_characters([CharSet.LATIN_1, CharSet.CENTRAL_EUROPEAN]);
  expect(new Set(merged).size).toBe(merged.length);
  expect(merged.filter((char) => char === "Á")).toHaveLength(1);
  expect(project_characters([CharSet.BASIC_LATIN])[0]).toBe("A");
});
