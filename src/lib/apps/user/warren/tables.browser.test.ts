import { describe, expect, test } from "vitest";
import { PASTE_COMMAND } from "lexical";
import { entry_blob, read_zip } from "$lib/core/utils/zip/read";
import { build_docx } from "./docx";
import { BlockStyle, TableAction, WarrenEditor } from "./editor.svelte";
import { SAMPLE_V5 } from "./fixture";
import { parse_document, serialize_document } from "./format";
import { blocks_of, document_text, type TableBlock } from "./model";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

function mounted() {
  const editor = new WarrenEditor((error) => {
    throw error;
  });
  const root = document.createElement("div");
  root.contentEditable = "true";
  document.body.append(root);
  const stop = editor.mount(root);
  editor.reset();
  return { editor, root, dispose: () => (stop(), root.remove(), editor.destroy()) };
}

const tables_of = (editor: WarrenEditor) => blocks_of(editor.json).filter((block): block is TableBlock => block.kind === "table");

function paste(editor: WarrenEditor, text: string) {
  const data = new DataTransfer();
  data.setData("text/plain", text);
  editor.lexical.dispatchCommand(PASTE_COMMAND, new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
}

describe("tables in the editor", () => {
  test("insert, add and remove rows and columns, header row, borders and widths, as one table", async () => {
    const { editor, root, dispose } = mounted();
    editor.focus();
    editor.insert_table(2, 3);
    await tick();
    expect(editor.table).toMatchObject({ rows: 2, columns: 3, row: 0, column: 0, header: false, borders: true });
    expect(blocks_of(editor.json).at(-1)?.kind).toBe("paragraph");

    editor.table_action(TableAction.ROW_BELOW);
    editor.table_action(TableAction.COLUMN_RIGHT);
    await tick();
    expect(editor.table).toMatchObject({ rows: 3, columns: 4 });
    editor.table_action(TableAction.DELETE_COLUMN);
    await tick();
    expect(editor.table?.columns).toBe(3);

    editor.set_table_header(true);
    editor.set_table_borders(false);
    editor.set_table_widths([50, 25, 25]);
    await tick();
    const [table] = tables_of(editor);
    expect(table.rows[0].every((cell) => cell.header)).toBe(true);
    expect(table.borders).toBe(false);
    expect(table.widths).toEqual([50, 25, 25]);
    const element = root.querySelector("table")!;
    expect(element.dataset.borders).toBe("off");
    expect([...element.querySelectorAll("col")].map((col) => col.style.width)).toEqual(["50%", "25%", "25%"]);
    expect(root.querySelector("th")).not.toBeNull();

    const saved = parse_document(serialize_document(editor.snapshot()));
    expect(tables_of({ json: saved.editor } as WarrenEditor)).toEqual([table]);

    editor.table_action(TableAction.DELETE_TABLE);
    await tick();
    expect(tables_of(editor)).toEqual([]);
    dispose();
  });

  test("tab-separated text becomes a table, and fills the cells from the caret's", async () => {
    const { editor, dispose } = mounted();
    editor.focus();
    paste(editor, "Name\tYears\nAda\t3\n");
    await tick();
    const [table] = tables_of(editor);
    expect(table.rows.length).toBe(2);
    expect(document_text(editor.json)).toContain("Name\nYears\nAda\n3");
    paste(editor, "A\tB\tC\nD\tE\tF\nG\tH\tI");
    await tick();
    const [grown] = tables_of(editor);
    expect([grown.rows.length, grown.widths.length]).toEqual([3, 3]);
    expect(document_text(editor.json)).toContain("A\nB\nC\nD\nE\nF\nG\nH\nI");
    dispose();
  });

  test("a page break asked for inside a table goes after it", async () => {
    const { editor, dispose } = mounted();
    editor.focus();
    editor.insert_table(1, 2);
    await tick();
    editor.insert_page_break();
    await tick();
    const kinds = blocks_of(editor.json).map((block) => block.kind);
    expect(kinds[kinds.indexOf("table") + 1]).toBe("page-break");
    dispose();
  });
});

describe("title, quote, colour and styles in the editor", () => {
  test("blocks become a title or a quote, and runs take a colour and a highlight", async () => {
    const { editor, dispose } = mounted();
    editor.load({ ...SAMPLE_V5, editor: { root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: "Hello there" }] }] } } as typeof SAMPLE_V5.editor });
    editor.focus();
    await tick();
    editor.set_block(BlockStyle.TITLE);
    await tick();
    expect(editor.block).toBe(BlockStyle.TITLE);
    expect(editor.size).toBe(28);
    editor.set_block(BlockStyle.QUOTE);
    await tick();
    expect(blocks_of(editor.json)[0].kind).toBe("quote");

    editor.select_next("there");
    await tick();
    editor.set_colour("color", "#c00000");
    editor.set_colour("background-color", "#fff3a3");
    await tick();
    expect([editor.color, editor.highlight]).toEqual(["#c00000", "#fff3a3"]);
    const runs = blocks_of(editor.json)[0];
    expect(runs.kind === "quote" && runs.runs.find((run) => run.text === "there")).toMatchObject({ color: "#c00000", highlight: "#fff3a3" });
    editor.set_colour("color", null);
    await tick();
    expect(editor.color).toBeNull();
    dispose();
  });

  test("styles change, are saved as what differs and count as an edit", async () => {
    const { editor, dispose } = mounted();
    editor.load(SAMPLE_V5);
    await tick();
    expect(editor.styles.normal.size).toBe(10.5);
    expect(editor.dirty).toBe(false);
    editor.set_style("h2", { color: "#2f9e44", before: 20 });
    expect(editor.dirty).toBe(true);
    expect(editor.snapshot().styles).toEqual({ ...SAMPLE_V5.styles, h2: { color: "#2f9e44", before: 20 } });
    editor.reset_style("normal");
    expect(editor.snapshot().styles?.normal).toBeUndefined();
    dispose();
  });
});

describe(".docx with tables, styles and colour", () => {
  test("every part is well-formed and table, cell, paragraph and run properties are in the schema's order", async () => {
    const blob = await build_docx(SAMPLE_V5, "CV");
    const archive = await read_zip(blob);
    const parse = async (name: string) => {
      const entry = archive.entries.find((item) => item.name === name)!;
      const xml = new DOMParser().parseFromString(await (await entry_blob(blob, entry)).text(), "application/xml");
      expect(xml.querySelector("parsererror"), name).toBeNull();
      return xml;
    };
    const document_ = await parse("word/document.xml");
    const styles = await parse("word/styles.xml");
    const ordered = (parent: Element, order: string[]) => {
      const seen = [...parent.children].map((child) => order.indexOf(child.localName));
      expect(seen.every((at) => at >= 0), `${parent.localName}: ${[...parent.children].map((child) => child.localName)}`).toBe(true);
      expect([...seen].sort((a, b) => a - b)).toEqual(seen);
    };
    const tables = [...document_.getElementsByTagNameNS(W, "tbl")];
    expect(tables).toHaveLength(2);
    for (const table of tables) {
      expect([...table.children].slice(0, 2).map((child) => child.localName)).toEqual(["tblPr", "tblGrid"]);
      ordered(table.getElementsByTagNameNS(W, "tblPr")[0], ["tblW", "tblBorders", "tblLayout", "tblCellMar"]);
      ordered(table.getElementsByTagNameNS(W, "tblBorders")[0], ["top", "left", "bottom", "right", "insideH", "insideV"]);
      for (const cell of table.getElementsByTagNameNS(W, "tc")) {
        expect(cell.firstElementChild?.localName).toBe("tcPr");
        expect(cell.lastElementChild?.localName).toBe("p");
        ordered(cell.firstElementChild!, ["tcW", "gridSpan", "vMerge"]);
      }
    }
    const grid = tables[0].getElementsByTagNameNS(W, "gridCol").length;
    for (const row of tables[0].getElementsByTagNameNS(W, "tr")) {
      const spans = [...row.getElementsByTagNameNS(W, "tc")].map((cell) => Number(cell.getElementsByTagNameNS(W, "gridSpan")[0]?.getAttributeNS(W, "val") ?? 1));
      expect(spans.reduce((sum, span) => sum + span, 0)).toBe(grid);
    }
    const run_order = ["rStyle", "rFonts", "b", "bCs", "i", "iCs", "strike", "color", "sz", "szCs", "u", "shd", "vertAlign", "lang"];
    const paragraph_order = ["pStyle", "keepNext", "pageBreakBefore", "numPr", "pBdr", "spacing", "ind", "contextualSpacing", "jc", "outlineLvl"];
    for (const xml of [document_, styles]) {
      for (const props of xml.getElementsByTagNameNS(W, "rPr")) ordered(props, run_order);
      for (const props of xml.getElementsByTagNameNS(W, "pPr")) ordered(props, paragraph_order);
    }
    const ids = [...styles.getElementsByTagNameNS(W, "style")].map((style) => style.getAttributeNS(W, "styleId"));
    expect(ids).toEqual(expect.arrayContaining(["Normal", "Title", "Heading1", "Heading2", "Heading3", "Quote", "ListParagraph", "Hyperlink"]));
    const used = [...document_.getElementsByTagNameNS(W, "pStyle")].map((style) => style.getAttributeNS(W, "val"));
    for (const id of used) expect(ids).toContain(id);
  });
});
