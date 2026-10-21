import { describe, expect, it } from "vitest";
import { entry_blob, read_zip } from "$lib/core/utils/zip/read";
import { build_docx, docx_parts, document_xml, escape_xml, numbering_xml } from "./docx";
import { SAMPLE } from "./fixture";
import { body_html, print_document } from "./print";

describe("docx", () => {
  it("packs every part a Word file needs", async () => {
    const blob = await build_docx(SAMPLE, "CV");
    const archive = await read_zip(blob);
    const names = archive.entries.map((entry) => entry.name);
    expect(names).toEqual(Object.keys(docx_parts(SAMPLE, "CV")));
    expect(names[0]).toBe("[Content_Types].xml");
    const types = await (await entry_blob(blob, archive.entries[0])).text();
    for (const part of ["/word/document.xml", "/word/styles.xml", "/word/numbering.xml", "/docProps/core.xml"]) expect(types).toContain(`PartName="${part}"`);
  });

  it("writes headings, runs, lists, breaks and the page size", () => {
    const xml = document_xml(SAMPLE);
    expect(xml).toContain(`<w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t xml:space="preserve">Jane &amp; Co &lt;CV&gt;</w:t></w:r>`);
    expect(xml).toContain(`<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">very</w:t></w:r>`);
    expect(xml).toContain(`<w:rPr><w:i/><w:iCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`);
    expect(xml).toContain("<w:br/>");
    expect(xml).toContain(`<w:numPr><w:ilvl w:val="1"/><w:numId w:val="2"/></w:numPr>`);
    expect(xml).toMatch(/<w:pageBreakBefore\/><\/w:pPr><w:r><w:t xml:space="preserve">Dot/);
    expect(xml).toContain(`<w:pgSz w:w="12240" w:h="15840"/>`);
  });

  it("gives every list its own numbering, restarting at its start", () => {
    const xml = numbering_xml(SAMPLE);
    expect(xml.match(/<w:num w:numId=/g)).toHaveLength(3);
    expect(xml).toContain(`<w:num w:numId="1"><w:abstractNumId w:val="1"/>`);
    expect(xml).toContain(`<w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="1">`);
  });

  it("drops characters XML can't hold", () => {
    expect(escape_xml("a\u0001b\u0008c & \"d\"")).toBe("abc &amp; &quot;d&quot;");
  });
});

describe("print", () => {
  it("lays the document out for the printer with its page size and breaks", () => {
    const html = print_document(SAMPLE, "CV", "/inter.woff2");
    expect(html).toContain("@page{size:letter portrait;margin:20mm}");
    expect(body_html(SAMPLE)).toContain(`<h1>Jane &amp; Co &lt;CV&gt;</h1>`);
    expect(body_html(SAMPLE)).toContain(`<strong>very</strong><em><span style="font-size:14pt"> fast</span></em><br>`);
    expect(body_html(SAMPLE)).toContain(`<ol><li>One</li><li class="nested"><ul><li>Nested</li></ul></li><li>Two</li></ol><div class="break"></div>`);
    expect(body_html(SAMPLE)).toMatch(/<p><br><\/p>$/);
  });
});
