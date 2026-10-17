import { PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, test } from "vitest";
import {
  DEFAULT_PDF,
  Orientation,
  page_size,
  Paper,
  parse_page,
  pdf_bytes,
  pdf_date,
  pdf_size,
  plan_pdf,
  text_width,
  wrap,
  type PdfLayout,
  type TestPdfOptions,
} from "./test-pdf";

const DATE = pdf_date(new Date(Date.UTC(2026, 9, 17, 12, 0, 0)));
const natural: PdfLayout = { payload: null, pad: 0, date: DATE };
const options = (patch: Partial<TestPdfOptions> = {}): TestPdfOptions => ({ ...DEFAULT_PDF, ...patch });
const text = (bytes: Uint8Array) => String.fromCharCode(...bytes);

function check_xref(bytes: Uint8Array): void {
  const source = new TextDecoder("latin1").decode(bytes);
  const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(source)![1]);
  expect(source.slice(start, start + 5)).toBe("xref\n");
  const [, , count] = /^xref\n0 (\d+)\n/.exec(source.slice(start))!.map(Number);
  const entries = source.slice(start).split("\n").slice(3, 2 + count);
  entries.forEach((entry, index) => {
    expect(entry).toMatch(/^\d{10} 00000 n $/);
    const offset = Number(entry.slice(0, 10));
    expect(source.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
  });
}

describe("parse_page", () => {
  test("takes paper names and WxH in millimetres", () => {
    expect(parse_page("A4")).toMatchObject({ paper: Paper.A4 });
    expect(parse_page("mixed")).toMatchObject({ paper: Paper.MIXED });
    expect(parse_page("100x50")).toEqual({ paper: Paper.CUSTOM, custom_width: 100, custom_height: 50 });
    expect(parse_page("88.9 × 50.8 mm")).toEqual({ paper: Paper.CUSTOM, custom_width: 88.9, custom_height: 50.8 });
    expect(parse_page("custom")).toBeNull();
    expect(parse_page("5x5")).toBeNull();
    expect(parse_page("big")).toBeNull();
  });
});

describe("page_size", () => {
  test("paper is portrait unless asked; mixed cycles sizes and turns every other page", () => {
    expect(page_size(options(), 0)).toEqual({ name: "A4", orientation: "portrait", width: 210, height: 297 });
    expect(page_size(options({ orientation: Orientation.LANDSCAPE }), 0)).toMatchObject({ width: 297, height: 210, orientation: "landscape" });
    const mixed = options({ paper: Paper.MIXED, orientation: Orientation.MIXED });
    expect([0, 1, 2].map((index) => page_size(mixed, index).name)).toEqual(["A4", "Letter", "A5"]);
    expect(page_size(mixed, 1).orientation).toBe("landscape");
  });

  test("a custom size is taken as typed; landscape swaps it", () => {
    const custom = options({ paper: Paper.CUSTOM, custom_width: 300, custom_height: 100 });
    expect(page_size(custom, 0)).toMatchObject({ width: 300, height: 100, orientation: "landscape" });
    expect(page_size({ ...custom, orientation: Orientation.LANDSCAPE }, 0)).toMatchObject({ width: 100, height: 300 });
  });
});

describe("text", () => {
  test("measures with Helvetica widths and wraps on words", () => {
    expect(text_width("10", 10)).toBeCloseTo(11.12);
    expect(text_width("·×", 1000)).toBe(278 + 584);
    const lines = wrap("one two three four five six", 10, 50);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(text_width(line, 10)).toBeLessThanOrEqual(50);
  });
});

describe("pdf_parts", () => {
  test("pdf-lib reads the pages back with their sizes", async () => {
    const bytes = pdf_bytes(options({ pages: 5, paper: Paper.MIXED, orientation: Orientation.MIXED, text: 2, images: 2, image_size: 16, grid: 10 }), natural);
    expect(bytes.length).toBe(pdf_size(options({ pages: 5, paper: Paper.MIXED, orientation: Orientation.MIXED, text: 2, images: 2, image_size: 16, grid: 10 }), natural));
    check_xref(bytes);
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(5);
    const [first, second] = document.getPages().map((page) => page.getSize());
    expect(first.width).toBeCloseTo((210 * 72) / 25.4, 1);
    expect(second.width).toBeCloseTo((279.4 * 72) / 25.4, 1);
    expect(document.getTitle()).toBe("Test PDF");
  });

  test("labels and big numbers end up in the content, escaped", () => {
    const source = text(pdf_bytes(options({ pages: 2, label: "(p{page}/{pages}) {size}" }), natural));
    expect(source).toContain("(\\(p2/2\\) 210 \xd7 297 mm) Tj");
    expect(source).toContain("(2) Tj");
  });
});

describe("plan_pdf", () => {
  test("lands on the exact size, with the payload in each page's PieceInfo", async () => {
    for (const target of [50_000, 1_000_003, 3 * 1024 * 1024]) {
      const plan = plan_pdf(options({ pages: 7 }), target, DATE);
      if (!plan.ok) throw new Error(plan.error);
      const bytes = pdf_bytes(options({ pages: 7 }), plan.layout);
      expect(bytes.length).toBe(target);
      check_xref(bytes);
      const document = await PDFDocument.load(bytes);
      expect(document.getPageCount()).toBe(7);
      expect(document.getPage(0).node.get(PDFName.of("PieceInfo"))).toBeDefined();
      const total = plan.layout.payload!.reduce((sum, bytes) => sum + bytes, 0);
      expect(total).toBeGreaterThan(target - 40_000);
    }
  });

  test("refuses sizes below what the pages take, or past the 10-digit offsets", () => {
    expect(plan_pdf(options({ pages: 100 }), 1000, DATE)).toMatchObject({ ok: false });
    expect(plan_pdf(options(), 20 * 1024 ** 3, DATE)).toMatchObject({ ok: false });
  });

  test("without a target the size is what the pages take", () => {
    const plan = plan_pdf(options({ pages: 3 }), null, DATE);
    expect(plan).toMatchObject({ ok: true, bytes: pdf_bytes(options({ pages: 3 }), natural).length });
  });
});
