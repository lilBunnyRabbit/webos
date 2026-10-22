import { VERSION, type DocNode, type WarrenDocument } from "./format";

const text = (value: string, format = 0, style = ""): DocNode => ({ type: "text", text: value, format, style, detail: 0, mode: "normal", version: 1 }) as DocNode;
const block = (type: string, children: DocNode[], extra: Record<string, unknown> = {}): DocNode =>
  ({ type, children, direction: null, format: "", indent: 0, version: 1, ...extra }) as DocNode;

export const SAMPLE: WarrenDocument = {
  version: VERSION,
  page: { size: "Letter", flow: "sheets" },
  editor: {
    root: block("root", [
      block("heading", [text("Jane & Co <CV>")], { tag: "h1", format: "center" }),
      block("paragraph", [text("A fast learner, "), text("very", 1), text(" fast", 2, "font-size: 14pt;"), { type: "linebreak", version: 1 } as DocNode, text("Breakfast "), block("link", [text("fan")], { url: "https://example.com/?a=1&b=2", rel: null, target: null, title: null }), text(".")]),
      block("list", [
        block("listitem", [text("One")], { value: 1 }),
        block("listitem", [block("list", [block("listitem", [text("Nested")], { value: 1 })], { listType: "bullet", start: 1, tag: "ul" })], { value: 2 }),
        block("listitem", [text("Two")], { value: 2, format: "end" }),
      ], { listType: "number", start: 1, tag: "ol" }),
      { type: "page-break", version: 1 } as DocNode,
      block("list", [block("listitem", [text("Dot")], { value: 1 })], { listType: "bullet", start: 1, tag: "ul" }),
      block("paragraph", []),
    ]) as WarrenDocument["editor"]["root"],
  },
};

export const SAMPLE_V3: WarrenDocument = {
  version: VERSION,
  page: { size: "A4", flow: "sheets" },
  goal: 500,
  editor: {
    root: block("root", [
      block("heading", [text("Plan")], { tag: "h2" }),
      block("paragraph", [text("H"), text("2", 32), text("O and E=mc"), text("2", 64), text(" old", 4)]),
      { type: "horizontalrule", version: 1 } as DocNode,
      block("list", [
        block("listitem", [text("Pack")], { value: 1, checked: true }),
        block("listitem", [text("Go")], { value: 2, checked: false }),
      ], { listType: "check", start: 1, tag: "ul" }),
    ]) as WarrenDocument["editor"]["root"],
  },
};

export const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export const SAMPLE_V4: WarrenDocument = {
  version: VERSION,
  page: { size: "A4", flow: "sheets", orientation: "landscape", margins: { top: 25, right: 15, bottom: 30, left: 15 } },
  header: {
    root: block("root", [
      { type: "image", version: 1, src: PIXEL, width: 20, align: "left", alt: "Mark" } as DocNode,
      block("paragraph", [text("Jane Doe", 1), text(" · {page}")], { format: "right" }),
    ]) as WarrenDocument["editor"]["root"],
  },
  footer: { root: block("root", [block("paragraph", [text("Page {page} of {pages}")], { format: "center" })]) as WarrenDocument["editor"]["root"] },
  editor: {
    root: block("root", [
      block("heading", [text("Report")], { tag: "h1" }),
      { type: "image", version: 1, src: PIXEL, width: 40, align: "right", alt: "Logo" } as DocNode,
      block("paragraph", [text("Body text")]),
    ]) as WarrenDocument["editor"]["root"],
  },
};

const cell = (children: DocNode[], extra: Record<string, unknown> = {}): DocNode => block("tablecell", children, { colSpan: 1, rowSpan: 1, headerState: 0, ...extra });
const row = (cells: DocNode[]): DocNode => block("tablerow", cells);
const line = (value: string, format = 0, style = "") => block("paragraph", [text(value, format, style)]);

export const SAMPLE_V5: WarrenDocument = {
  version: VERSION,
  page: { size: "A4", flow: "sheets" },
  styles: { normal: { size: 10.5, color: "#222222" }, h1: { color: "#1971c2", align: "center" }, title: { font: "burrow" } },
  editor: {
    root: block("root", [
      block("title", [text("Jane Doe")], { format: "center" }),
      block("quote", [text("Make it simple.")]),
      block("paragraph", [text("Red", 0, "color: #c00000;"), text(" and "), text("marked", 1, "background-color: #fff3a3;")]),
      block(
        "table",
        [
          row([cell([line("Skill")], { headerState: 1 }), cell([line("Level")], { headerState: 1 }), cell([line("Years")], { headerState: 1 })]),
          row([cell([line("Writing")], { rowSpan: 2 }), cell([line("Expert", 1)], { colSpan: 2 })]),
          row([cell([line("Good")]), cell([block("list", [block("listitem", [text("Five")], { value: 1 })], { listType: "bullet", start: 1, tag: "ul" })])]),
        ],
        { colWidths: [50, 25, 25] }
      ),
      block("table", [row([cell([line("Left")]), cell([line("Right")])])], { $: { borders: false } }),
      block("paragraph", []),
    ]) as WarrenDocument["editor"]["root"],
  },
};

const mark = (ids: string[], children: DocNode[]): DocNode => block("mark", children, { ids });

export const SAMPLE_V6: WarrenDocument = {
  version: VERSION,
  id: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  page: { size: "A4", flow: "sheets" },
  comments: [
    { id: "c-one", text: "Say who you are.", quote: "Jane wrote this", created: Date.UTC(2026, 9, 22, 9, 30) },
    { id: "c-two", text: "Too long\nCut it.", quote: "and that", created: Date.UTC(2026, 9, 22, 10), resolved: true },
  ],
  ignored_words: ["warren"],
  editor: {
    root: block("root", [
      block("paragraph", [text("Hello "), mark(["c-one"], [text("Jane "), text("wrote", 1), text(" this")])]),
      block("paragraph", [mark(["c-one", "c-two"], [text("and that")]), text(" end.")]),
    ]) as WarrenDocument["editor"]["root"],
  },
};
