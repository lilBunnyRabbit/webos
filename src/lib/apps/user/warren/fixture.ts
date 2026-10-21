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
