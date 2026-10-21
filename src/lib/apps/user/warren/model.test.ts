import { describe, expect, it } from "vitest";
import { SAMPLE } from "./fixture";
import { create_document, parse_document, serialize_document } from "./format";
import { blocks_of, document_text, font_size } from "./model";
import { count, find_word, map_offset, match_case, repeated_words, replace_word, word_at } from "./words";

describe("format", () => {
  it("round-trips a document", () => {
    expect(parse_document(serialize_document(SAMPLE))).toEqual(SAMPLE);
    expect(parse_document(serialize_document(create_document())).page).toEqual({ size: "A4", flow: "sheets" });
  });

  it("rejects what isn't a Warren document", () => {
    expect(() => parse_document("nope")).toThrow("isn't JSON");
    expect(() => parse_document(JSON.stringify({ version: 1, page: { size: "A3", flow: "sheets" }, editor: SAMPLE.editor }))).toThrow("page.size");
    expect(() => parse_document(JSON.stringify({ ...SAMPLE, version: 2 }))).toThrow("newer Warren");
    expect(() => parse_document(JSON.stringify({ ...SAMPLE, editor: { root: { type: "paragraph", children: [] } } }))).toThrow("editor.root.type");
  });
});

describe("blocks_of", () => {
  it("flattens headings, runs, nested lists and breaks", () => {
    const blocks = blocks_of(SAMPLE.editor);
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "item", "item", "item", "page-break", "item", "paragraph"]);
    const paragraph = blocks[1];
    expect(paragraph.kind === "paragraph" && paragraph.runs.map((run) => [run.text, run.bold, run.italic, run.size])).toEqual([
      ["A fast learner, ", false, false, null],
      ["very", true, false, null],
      [" fast", false, true, 14],
      ["\n", false, false, null],
      ["Breakfast fan.", false, false, null],
    ]);
    const [one, nested, two] = blocks.slice(2, 5);
    expect([one, nested, two].map((block) => block.kind === "item" && [block.list, block.level, block.list_id])).toEqual([
      ["number", 0, 1],
      ["bullet", 1, 2],
      ["number", 0, 1],
    ]);
  });

  it("reads the text a reader sees", () => {
    expect(document_text(SAMPLE.editor)).toBe("Jane & Co <CV>\nA fast learner, very fast\nBreakfast fan.\nOne\nNested\nTwo\nDot\n");
  });

  it("reads font sizes in points or pixels", () => {
    expect(font_size("font-size: 14pt;")).toBe(14);
    expect(font_size("color: red; font-size: 16px")).toBe(12);
    expect(font_size("")).toBeNull();
  });
});

describe("words", () => {
  it("counts words and characters without line ends", () => {
    expect(count("Don't stop—well-known 42 times.\nNext")).toEqual({ words: 6, characters: 35 });
    expect(count("")).toEqual({ words: 0, characters: 0 });
  });

  it("finds whole words, ignoring case", () => {
    expect(find_word("Fast, fast! breakfast fasted fast", "fast").map((range) => range.start)).toEqual([0, 6, 29]);
  });

  it("replaces in the case of what it replaces", () => {
    expect(replace_word("Fast fast FAST breakfast", "fast", "quick")).toEqual({ text: "Quick quick QUICK breakfast", count: 3 });
    expect(match_case("quick", "F")).toBe("Quick");
  });

  it("moves offsets past replaced words", () => {
    const text = "a fast b fast";
    expect(map_offset(text, "fast", "quick", 2)).toBe(2);
    expect(map_offset(text, "fast", "quick", 6)).toBe(7);
    expect(map_offset(text, "fast", "quick", 4)).toBe(7);
    expect(map_offset(text, "fast", "quick", 13)).toBe(15);
  });

  it("finds the word at the caret", () => {
    expect(word_at("hello world", 7)).toEqual({ start: 6, end: 11 });
    expect(word_at("hello world", 5)).toEqual({ start: 0, end: 5 });
    expect(word_at("a  b", 2)).toBeNull();
  });

  it("lists repeated descriptive words, most used first", () => {
    const text = "Really great work. Really great team. Great results, which were really there with them.";
    expect(repeated_words(text)).toEqual([
      { word: "great", count: 3 },
      { word: "really", count: 3 },
    ]);
  });
});
