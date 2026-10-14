import { describe, expect, test } from "vitest";
import {
  count_pages,
  css_string,
  DEFAULT_SETTINGS,
  document_css,
  marks_html,
  page_box,
  print_css,
  print_document,
  SettingsSchema,
  type PdfSettings,
} from "./layout";

const FONTS = { inter: "/i.woff2", hack_regular: "/h.woff2", hack_bold: "/hb.woff2" };
const META = { title: 'My "notes"', date: "Oct 14, 2026" };
const with_settings = (patch: Partial<PdfSettings>): PdfSettings => ({ ...DEFAULT_SETTINGS, ...patch });

describe("page_box", () => {
  test("A4 portrait and landscape", () => {
    expect(page_box(DEFAULT_SETTINGS)).toEqual({ width: 210, height: 297, margin: 20 });
    expect(page_box(with_settings({ orientation: "landscape", margins: "narrow" }))).toEqual({ width: 297, height: 210, margin: 12.7 });
  });

  test("Letter", () => {
    expect(page_box(with_settings({ page_size: "letter" }))).toMatchObject({ width: 215.9, height: 279.4 });
  });
});

describe("count_pages", () => {
  const box = page_box(DEFAULT_SETTINGS);
  const content = box.height - 2 * box.margin;
  const gap = 2 * box.margin + 6;

  test("an empty or short flow is one page", () => {
    expect(count_pages(0, box)).toBe(1);
    expect(count_pages(40, box)).toBe(1);
  });

  test("each further page adds its content height plus the gap", () => {
    expect(count_pages(content, box)).toBe(1);
    expect(count_pages(2 * content + gap, box)).toBe(2);
    expect(count_pages(3 * content + 2 * gap, box)).toBe(3);
  });
});

describe("print css", () => {
  test("page size, orientation and margin", () => {
    const css = print_css(with_settings({ page_size: "letter", orientation: "landscape", margins: "wide" }), META);
    expect(css).toContain("size:letter landscape");
    expect(css).toContain("margin:30mm");
  });

  test("header and footer boxes follow the switches", () => {
    const css = print_css(with_settings({ show_title: true, show_date: true, page_numbers: true }), META);
    expect(css).toContain('@top-left{content:"My \\"notes\\""');
    expect(css).toContain('@top-right{content:"Oct 14, 2026"');
    expect(css).toContain('@bottom-right{content:counter(page) " / " counter(pages)');
    const bare = print_css(with_settings({ show_title: false, show_date: false, page_numbers: false }), META);
    expect(bare).not.toMatch(/@top-|@bottom-/);
  });

  test("css_string escapes quotes, backslashes and newlines", () => {
    expect(css_string('a "b" \\ c\nd')).toBe('"a \\"b\\" \\\\ c d"');
  });

  test("forced breaks are spelled for the medium", () => {
    const report = with_settings({ template: "report" });
    expect(document_css(report, "page")).toContain("break-before:page");
    expect(document_css(report, "column")).toContain("break-before:column");
    expect(document_css(report, "column")).not.toContain("break-before:page");
  });
});

describe("print_document", () => {
  const html = print_document("<h1>Hi</h1>", DEFAULT_SETTINGS, META, FONTS);

  test("carries the body, title and fonts", () => {
    expect(html).toContain('<main class="doc"><h1>Hi</h1></main>');
    expect(html).toContain("<title>My &quot;notes&quot;</title>");
    expect(html).toContain('url("/i.woff2")');
  });

  test("allows no script", () => {
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/script-src/);
  });
});

describe("marks_html", () => {
  test("one header and footer per page, with its number", () => {
    const html = marks_html(3, with_settings({ show_date: true }), META);
    expect(html.match(/class="mark"/g)).toHaveLength(3);
    expect(html).toContain("2 / 3");
    expect(html).toContain("My &quot;notes&quot;");
    expect(html).toContain('style="top:303mm"');
  });

  test("no page numbers when switched off", () => {
    expect(marks_html(2, with_settings({ page_numbers: false }), META)).not.toContain("1 / 2");
  });
});

describe("SettingsSchema", () => {
  test("accepts the defaults and rejects out-of-range values", () => {
    expect(SettingsSchema.safeParse(DEFAULT_SETTINGS).success).toBe(true);
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, font_size: 40 }).success).toBe(false);
    expect(SettingsSchema.safeParse({ ...DEFAULT_SETTINGS, template: "fancy" }).success).toBe(false);
  });
});
