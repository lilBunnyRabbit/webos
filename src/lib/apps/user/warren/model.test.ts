import { describe, expect, it } from "vitest";
import { PIXEL, SAMPLE, SAMPLE_V3, SAMPLE_V4, SAMPLE_V5 } from "./fixture";
import { style_colour } from "./colour";
import { DEFAULT_STYLES, resolve_styles, style_fonts, style_overrides } from "./styles";
import { column_percents, grid_rows, move_border, parse_tsv, with_column_width } from "./table";
import { create_document, parse_document, serialize_document } from "./format";
import { blocks_of, document_text, fill_tokens, font_size, has_text, is_page_number_line, normalize_url, page_number_align, picture_size, safe_image, safe_url } from "./model";
import { geometry, margin_preset, preset_margins } from "./page";
import { smarten } from "./typography";
import { count, find_matches, find_word, map_offset, match_case, reading_minutes, repeated_words, replace_matches, replace_word, TEXT_MATCH, word_at } from "./words";

describe("format", () => {
  it("round-trips a document", () => {
    expect(parse_document(serialize_document(SAMPLE))).toEqual(SAMPLE);
    expect(parse_document(serialize_document(create_document())).page).toEqual({ size: "A4", flow: "sheets" });
  });

  it("rejects what isn't a Warren document", () => {
    expect(() => parse_document("nope")).toThrow("isn't JSON");
    expect(() => parse_document(JSON.stringify({ version: 1, page: { size: "A3", flow: "sheets" }, editor: SAMPLE.editor }))).toThrow("page.size");
    expect(() => parse_document(JSON.stringify({ ...SAMPLE, version: 6 }))).toThrow("newer Warren");
    expect(() => parse_document(JSON.stringify({ ...SAMPLE, goal: -3 }))).toThrow("goal");
    expect(() => parse_document(JSON.stringify({ ...SAMPLE, page: { ...SAMPLE.page, font: { kind: "builtin", id: "nope" } } }))).toThrow("page.font");
    expect(() => parse_document(JSON.stringify({ ...SAMPLE, editor: { root: { type: "paragraph", children: [] } } }))).toThrow("editor.root.type");
  });
});

describe("format versions", () => {
  it("opens version 1 to 4 files and saves them as version 5", () => {
    for (const version of [1, 2, 3, 4]) {
      const opened = parse_document(JSON.stringify({ ...SAMPLE, version }));
      expect(opened.version).toBe(5);
      expect(opened.goal).toBeUndefined();
      expect(opened.header).toBeUndefined();
      expect(JSON.parse(serialize_document(opened)).version).toBe(5);
    }
  });

  it("keeps page setup, header, footer and pictures", () => {
    expect(parse_document(serialize_document(SAMPLE_V4))).toEqual(SAMPLE_V4);
    const portrait = { ...SAMPLE, page: { ...SAMPLE.page, orientation: "portrait" as const } };
    expect(parse_document(serialize_document(portrait)).page).toEqual(SAMPLE.page);
    expect(() => parse_document(JSON.stringify({ ...SAMPLE, page: { ...SAMPLE.page, margins: { top: 10, right: 10, bottom: 10, left: 200 } } }))).toThrow("page.margins.left");
    expect(() => parse_document(JSON.stringify({ ...SAMPLE, header: { root: { type: "nope" } } }))).toThrow("header.root");
  });

  it("keeps the word goal", () => {
    expect(parse_document(serialize_document(SAMPLE_V3))).toEqual(SAMPLE_V3);
    expect(JSON.parse(serialize_document(SAMPLE)).goal).toBeUndefined();
  });

  it("keeps the body font, and drops a default one", () => {
    const burrow = { ...SAMPLE, page: { ...SAMPLE.page, font: { kind: "builtin" as const, id: "burrow" } } };
    expect(parse_document(serialize_document(burrow)).page.font).toEqual({ kind: "builtin", id: "burrow" });
    const file = { ...SAMPLE, page: { ...SAMPLE.page, font: { kind: "file" as const, name: "Hop.ttc" } } };
    expect(parse_document(serialize_document(file)).page.font).toEqual({ kind: "file", name: "Hop.ttc" });
    const plain = { ...SAMPLE, page: { ...SAMPLE.page, font: { kind: "default" as const } } };
    expect(parse_document(serialize_document(plain)).page).toEqual(SAMPLE.page);
  });
});

describe("links", () => {
  it("turns what was typed into a web or mail link", () => {
    expect(normalize_url("example.com/cv")).toBe("https://example.com/cv");
    expect(normalize_url(" http://a.b ")).toBe("http://a.b");
    expect(normalize_url("jane@example.com")).toBe("mailto:jane@example.com");
    expect(normalize_url("mailto:jane@example.com")).toBe("mailto:jane@example.com");
    expect(normalize_url("javascript:alert(1)")).toBeNull();
    expect(normalize_url("not a link")).toBeNull();
    expect(normalize_url("word")).toBeNull();
  });

  it("lets only web and mail links out", () => {
    expect(safe_url("https://x.y")).toBe("https://x.y");
    expect(safe_url("data:text/html,hi")).toBeNull();
    expect(safe_url(undefined)).toBeNull();
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
      ["Breakfast ", false, false, null],
      ["fan", false, false, null],
      [".", false, false, null],
    ]);
    expect(blocks.map((block) => has_text(block) && block.align)).toEqual(["center", null, null, null, "right", false, null, null]);
    expect(paragraph.kind === "paragraph" && paragraph.runs.map((run) => run.link)).toEqual([null, null, null, null, null, "https://example.com/?a=1&b=2", null]);
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

describe("format 3 blocks", () => {
  it("reads rules, check items and sub- and superscript runs", () => {
    const blocks = blocks_of(SAMPLE_V3.editor);
    expect(blocks.map((block) => block.kind)).toEqual(["heading", "paragraph", "rule", "item", "item"]);
    const paragraph = blocks[1];
    expect(paragraph.kind === "paragraph" && paragraph.runs.map((run) => [run.text, run.script, run.strike])).toEqual([
      ["H", null, false],
      ["2", "sub", false],
      ["O and E=mc", null, false],
      ["2", "super", false],
      [" old", null, true],
    ]);
    expect(blocks.slice(3).map((block) => block.kind === "item" && [block.list, block.checked])).toEqual([
      ["check", true],
      ["check", false],
    ]);
    expect(document_text(SAMPLE_V3.editor)).toBe("Plan\nH2O and E=mc2 old\nPack\nGo");
  });
});

describe("smart punctuation", () => {
  const typed = (text: string) => {
    const result = smarten(text, text.length);
    return result ? text.slice(0, result.start) + result.text + text.slice(result.end) : text;
  };

  it("curls quotes by what comes before", () => {
    expect(typed('"')).toBe("“");
    expect(typed('said "')).toBe("said “");
    expect(typed('“Hi"')).toBe("“Hi”");
    expect(typed("don'")).toBe("don’");
    expect(typed("('")).toBe("(‘");
    expect(typed("rock 'n'")).toBe("rock 'n’");
  });

  it("turns hyphens into dashes and three dots into an ellipsis", () => {
    expect(typed("a-")).toBe("a-");
    expect(typed("a--")).toBe("a–");
    expect(typed("a–-")).toBe("a—");
    expect(typed("wait...")).toBe("wait…");
    expect(typed("wait..")).toBe("wait..");
  });

  it("leaves URLs alone and only looks at the typed character", () => {
    expect(smarten("see https://a.b/x--", 19)).toBeNull();
    expect(smarten("www.a--", 7)).toBeNull();
    expect(smarten('a "b', 3)).toEqual({ start: 2, end: 3, text: "“" });
    expect(smarten("", 0)).toBeNull();
  });
});

describe("words", () => {
  it("estimates reading time", () => {
    expect([reading_minutes(0), reading_minutes(10), reading_minutes(460), reading_minutes(1000)]).toEqual([0, 1, 2, 4]);
  });

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

  it("finds and replaces text inside words too, literally", () => {
    expect(find_matches("Fast breakfast", "fast", false).map((range) => range.start)).toEqual([0, 10]);
    expect(find_matches("Fast breakfast", "fast", true).map((range) => range.start)).toEqual([0]);
    expect(find_matches("a.b axb", ".", false)).toHaveLength(1);
    expect(replace_matches("Fast breakfast", "fast", "slow", TEXT_MATCH)).toEqual({ text: "slow breakslow", count: 2 });
    expect(replace_matches("Fast breakfast", "fast", "slow", { whole: true, keep_case: true })).toEqual({ text: "Slow breakfast", count: 1 });
    expect(replace_matches("x", "", "y", TEXT_MATCH)).toEqual({ text: "x", count: 0 });
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

describe("format 4", () => {
  it("reads pictures as blocks, with only inline data kept", () => {
    expect(blocks_of(SAMPLE_V4.editor)).toContainEqual({ kind: "image", src: PIXEL, width: 40, align: "right", alt: "Logo" });
    expect(blocks_of({ root: { type: "root", children: [{ type: "image", src: "https://example.com/a.png" }] } })).toEqual([]);
    expect(blocks_of({ root: { type: "root", children: [{ type: "image", src: PIXEL, width: 400 }] } })).toEqual([{ kind: "image", src: PIXEL, width: 100, align: "center", alt: "" }]);
    expect(safe_image("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(document_text(SAMPLE_V4.editor)).toBe("Report\nBody text");
    expect(picture_size(SAMPLE_V4)).toBe(PIXEL.length * 2);
  });

  it("finds page number lines and fills page fields", () => {
    expect(is_page_number_line("{page}")).toBe(true);
    expect(is_page_number_line(" Page {page} of {pages} ")).toBe(true);
    expect(is_page_number_line("{page} / {pages}")).toBe(true);
    expect(is_page_number_line("Jane, page {page}")).toBe(false);
    expect(page_number_align(SAMPLE_V4.footer)).toBe("center");
    expect(page_number_align(SAMPLE_V4.header)).toBeNull();
    expect(fill_tokens("Page {page} of {pages}", 2, 5)).toBe("Page 2 of 5");
  });

  it("turns the page and picks margins", () => {
    expect(geometry({ size: "A4", flow: "sheets", orientation: "landscape" })).toEqual({ width: 297, height: 210, margins: { top: 20, right: 20, bottom: 20, left: 20 } });
    expect(margin_preset({ size: "A5", flow: "sheets" })).toBe("normal");
    expect(margin_preset({ size: "A4", flow: "sheets", margins: preset_margins("wide", "A4") })).toBe("wide");
    expect(margin_preset({ size: "A4", flow: "sheets", margins: { top: 1, right: 2, bottom: 3, left: 4 } })).toBe("custom");
  });
});

describe("format 5", () => {
  it("keeps tables, title, quote, colours and styles, dropping style fields that are not valid", () => {
    expect(parse_document(serialize_document(SAMPLE_V5))).toEqual(SAMPLE_V5);
    const messy = { ...SAMPLE_V5, styles: { normal: { size: 400, color: "red", bold: true }, quote: { font: "comic" } } };
    expect(parse_document(JSON.stringify(messy)).styles).toEqual({ normal: { size: 96, bold: true } });
    expect(JSON.parse(serialize_document(SAMPLE)).styles).toBeUndefined();
  });

  it("reads tables as rows of cells with their spans, header row, widths and borders", () => {
    const blocks = blocks_of(SAMPLE_V5.editor);
    expect(blocks.map((block) => block.kind)).toEqual(["title", "quote", "paragraph", "table", "table", "paragraph"]);
    const [table, layout] = blocks.filter((block) => block.kind === "table");
    expect(table.kind === "table" && table.widths).toEqual([50, 25, 25]);
    expect(table.kind === "table" && table.rows.map((cells) => cells.map((cell) => [cell.col_span, cell.row_span, cell.header]))).toEqual([
      [[1, 1, true], [1, 1, true], [1, 1, true]],
      [[1, 2, false], [2, 1, false]],
      [[1, 1, false], [1, 1, false]],
    ]);
    expect(table.kind === "table" && table.rows[2][1].blocks[0]).toMatchObject({ kind: "item", list: "bullet" });
    expect(layout).toMatchObject({ kind: "table", borders: false, widths: [50, 50] });
    expect(document_text(SAMPLE_V5.editor)).toBe("Jane Doe\nMake it simple.\nRed and marked\nSkill\nLevel\nYears\nWriting\nExpert\nGood\nFive\nLeft\nRight\n");
  });

  it("reads text colour and highlight from the run style", () => {
    const runs = blocks_of(SAMPLE_V5.editor)[2];
    expect(runs.kind === "paragraph" && runs.runs.map((run) => [run.color, run.highlight])).toEqual([["#c00000", null], [null, null], [null, "#fff3a3"]]);
    expect(style_colour("font-size: 12pt; color: #ABCDEF;", "color")).toBe("#abcdef");
    expect(style_colour("background-color: #fff3a3", "color")).toBeNull();
    expect(style_colour("color: red", "color")).toBeNull();
  });

  it("stores only what differs from the default styles", () => {
    const styles = resolve_styles(SAMPLE_V5.styles);
    expect(styles.normal).toEqual({ ...DEFAULT_STYLES.normal, size: 10.5, color: "#222222" });
    expect(style_overrides(styles)).toEqual(SAMPLE_V5.styles);
    expect(style_overrides(DEFAULT_STYLES)).toBeUndefined();
    expect(style_fonts(styles)).toEqual(["burrow"]);
  });
});

describe("tables", () => {
  it("lays cells on the grid, carrying row spans down", () => {
    const cell = (col_span: number, row_span: number) => ({ col_span, row_span });
    const a = cell(1, 2);
    const b = cell(2, 1);
    const { rows, columns } = grid_rows([[a, b], [cell(1, 1), cell(1, 1)]]);
    expect(columns).toBe(3);
    expect(rows[1].map((item) => [item.column, item.continued, item.cell === a])).toEqual([[0, true, true], [1, false, false], [2, false, false]]);
  });

  it("turns stored widths into percentages and moves borders", () => {
    expect(column_percents([2, 1, 1], 3)).toEqual([50, 25, 25]);
    expect(column_percents([1, 1], 3)).toEqual([100 / 3, 100 / 3, 100 / 3]);
    expect(with_column_width([50, 25, 25], 0, 30)).toEqual([30, 35, 35]);
    expect(with_column_width([50, 50], 1, 99)).toEqual([5, 95]);
    expect(move_border([50, 25, 25], 0, 10)).toEqual([60, 15, 25]);
    expect(move_border([50, 25, 25], 1, 30)).toEqual([50, 45, 5]);
  });

  it("reads tab-separated text as a grid", () => {
    expect(parse_tsv("a\tb\r\nc\n")).toEqual([["a", "b"], ["c", ""]]);
    expect(parse_tsv("no tabs here")).toBeNull();
    expect(parse_tsv("one\t")).toEqual([["one", ""]]);
  });
});
