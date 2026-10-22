import { describe, expect, it } from "vitest";
import { entry_blob, read_zip } from "$lib/core/utils/zip/read";
import { build_docx, docx_parts, document_xml, escape_xml, numbering_xml, styles_xml } from "./docx";
import { PIXEL, SAMPLE, SAMPLE_V3, SAMPLE_V4, SAMPLE_V5 } from "./fixture";
import { resolve_styles } from "./styles";
import { face_css, font_format } from "./fonts";
import { BODY_FAMILY, body_html, document_css, NO_FONTS, print_document, zone_padding } from "./print";

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
    expect(xml).toContain(`<w:pStyle w:val="Heading1"/><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">Jane &amp; Co &lt;CV&gt;</w:t></w:r>`);
    expect(xml).toContain(`<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">very</w:t></w:r>`);
    expect(xml).toContain(`<w:rPr><w:i/><w:iCs/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>`);
    expect(xml).toContain("<w:br/>");
    expect(xml).toContain(`<w:hyperlink r:id="rIdLink1" w:history="1"><w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t xml:space="preserve">fan</w:t></w:r></w:hyperlink>`);
    expect(xml).toMatch(/<w:jc w:val="right"\/><\/w:pPr><w:r><w:t xml:space="preserve">Two/);
    expect(xml).toContain(`<w:numPr><w:ilvl w:val="1"/><w:numId w:val="2"/></w:numPr>`);
    expect(xml).toMatch(/<w:pageBreakBefore\/><w:numPr>.*?<\/w:numPr><\/w:pPr><w:r><w:t xml:space="preserve">Dot/);
    expect(xml).toContain(`<w:pgSz w:w="12240" w:h="15840"/>`);
  });

  it("relates each link once and names the document font", () => {
    const parts = docx_parts({ ...SAMPLE, page: { ...SAMPLE.page, font: { kind: "file", name: "Hop & Co.ttf" } } }, "CV");
    expect(parts["word/_rels/document.xml.rels"]).toContain(
      `<Relationship Id="rIdLink1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com/?a=1&amp;b=2" TargetMode="External"/>`
    );
    expect(parts["word/styles.xml"]).toContain(`<w:rFonts w:ascii="Hop &amp; Co"`);
    expect(docx_parts(SAMPLE, "CV")["word/styles.xml"]).toContain(`<w:rFonts w:ascii="Inter"`);
  });

  it("gives every list its own numbering, restarting at its start", () => {
    const xml = numbering_xml(SAMPLE);
    expect(xml.match(/<w:num w:numId=/g)).toHaveLength(3);
    expect(xml).toContain(`<w:num w:numId="1"><w:abstractNumId w:val="1"/>`);
    expect(xml).toContain(`<w:num w:numId="2"><w:abstractNumId w:val="0"/><w:lvlOverride w:ilvl="1">`);
  });

  it("writes strikethrough, sub- and superscript, rules and check lists", () => {
    const xml = document_xml(SAMPLE_V3);
    expect(xml).toContain(`<w:r><w:rPr><w:vertAlign w:val="subscript"/></w:rPr><w:t xml:space="preserve">2</w:t></w:r>`);
    expect(xml).toContain(`<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr><w:t xml:space="preserve">2</w:t></w:r>`);
    expect(xml).toContain(`<w:r><w:rPr><w:strike/></w:rPr><w:t xml:space="preserve"> old</w:t></w:r>`);
    expect(xml).toContain(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr></w:pPr></w:p>`);
    expect(xml).toContain(`<w:p><w:r><w:t xml:space="preserve">☑ </w:t></w:r><w:r><w:t xml:space="preserve">Pack</w:t></w:r>`);
    expect(xml).toContain(`<w:t xml:space="preserve">☐ </w:t></w:r><w:r><w:t xml:space="preserve">Go</w:t>`);
    expect(numbering_xml(SAMPLE_V3)).not.toContain("<w:num ");
  });

  it("orders run properties as the schema wants", () => {
    const xml = document_xml({
      ...SAMPLE_V3,
      editor: { root: { type: "root", children: [{ type: "paragraph", children: [{ type: "text", text: "x", format: 1 | 4 | 8 | 64, style: "font-size: 9pt" }] }] } },
    });
    expect(xml).toContain(`<w:rPr><w:b/><w:bCs/><w:strike/><w:sz w:val="18"/><w:szCs w:val="18"/><w:u w:val="single"/><w:vertAlign w:val="superscript"/></w:rPr>`);
  });

  it("drops characters XML can't hold", () => {
    expect(escape_xml("a\u0001b\u0008c & \"d\"")).toBe("abc &amp; &quot;d&quot;");
  });
});

describe("print", () => {
  it("lays the document out for the printer with its page size and breaks", () => {
    const html = print_document(SAMPLE, "CV", "/inter.woff2");
    expect(html).toContain("@page{size:letter portrait;margin:20mm 20mm 20mm 20mm}");
    expect(body_html(SAMPLE)).toContain(`<h1 style="text-align:center">Jane &amp; Co &lt;CV&gt;</h1>`);
    expect(body_html(SAMPLE)).toContain(`<strong>very</strong><em><span style="font-size:14pt"> fast</span></em><br>`);
    expect(body_html(SAMPLE)).toContain(`<ol><li>One</li><li class="nested"><ul><li>Nested</li></ul></li><li style="text-align:right">Two</li></ol><div class="break"></div>`);
    expect(body_html(SAMPLE)).toMatch(/<p><br><\/p>$/);
    expect(body_html(SAMPLE)).toContain(`Breakfast <a href="https://example.com/?a=1&amp;b=2">fan</a>.`);
    expect(html).toContain(`font-family:Inter,Inter`);
  });

  it("prints rules, check lists and sub- and superscript", () => {
    const html = body_html(SAMPLE_V3);
    expect(html).toContain(`H<sub>2</sub>O and E=mc<sup>2</sup><s> old</s>`);
    expect(html).toContain(`<hr><ul class="wr-check"><li class="wr-checked">Pack</li><li class="wr-unchecked">Go</li></ul>`);
    expect(print_document(SAMPLE_V3, "Plan", "/inter.woff2")).toContain(".doc li.wr-checked::before");
  });

  it("embeds the document font inline", () => {
    const bytes = new Uint8Array([0, 1, 0, 0, 1, 2, 3]);
    const css = face_css(BODY_FAMILY, [{ bytes, descriptors: { weight: "300 700", style: "italic" } }]);
    expect(css).toBe(`@font-face{font-family:"warren-body";src:url(data:font/ttf;base64,AAEAAAECAw==) format("truetype");font-weight:300 700;font-style:italic}`);
    expect(print_document(SAMPLE, "CV", "/inter.woff2", { css, body: true })).toContain(`${css}html,body`);
    expect(print_document(SAMPLE, "CV", "/inter.woff2", { css, body: true })).toContain(`font-family:"warren-body",Inter`);
    expect(font_format(new TextEncoder().encode("wOF2xxxx"))).toEqual({ mime: "font/woff2", format: "woff2" });
  });
});

describe("format 4 exports", () => {
  const media = new Map([[PIXEL, { file: "image1.png", width: 200, height: 100 }]]);

  it("writes the header and footer as their own parts, with page fields", () => {
    const parts = docx_parts(SAMPLE_V4, "Report", new Date(0), media);
    expect(Object.keys(parts)).toEqual(expect.arrayContaining(["word/header1.xml", "word/footer1.xml", "word/_rels/header1.xml.rels"]));
    expect(parts["word/_rels/footer1.xml.rels"]).toBeUndefined();
    expect(parts["word/footer1.xml"]).toContain(`<w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>`);
    expect(parts["word/footer1.xml"]).toContain(`<w:fldSimple w:instr=" NUMPAGES ">`);
    expect(parts["word/footer1.xml"]).toMatch(/^<\?xml[^>]*\?>\n<w:ftr /);
    expect(parts["word/header1.xml"]).toContain(`<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Jane Doe</w:t></w:r>`);
    expect(parts["word/_rels/document.xml.rels"]).toContain(`Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"`);
    expect(parts["[Content_Types].xml"]).toContain(`<Default Extension="png" ContentType="image/png"/>`);
    expect(parts["[Content_Types].xml"]).toContain(`PartName="/word/footer1.xml"`);
  });

  it("orders the section as the schema wants, turned and with its margins", () => {
    const xml = document_xml(SAMPLE_V4, media);
    const section = xml.slice(xml.indexOf("<w:sectPr>"));
    const order = ["<w:headerReference", "<w:footerReference", "<w:pgSz", "<w:pgMar"].map((tag) => section.indexOf(tag));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(section).toContain(`<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>`);
    expect(section).toContain(`<w:pgMar w:top="1417" w:right="850" w:bottom="1701" w:left="850" w:header="709" w:footer="709" w:gutter="0"/>`);
  });

  it("puts pictures in as inline drawings sized to the column", () => {
    const xml = document_xml(SAMPLE_V4, media);
    const cx = Math.round(267 * 36000 * 0.4);
    expect(xml).toContain(`<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cx / 2}"/>`);
    expect(xml).toContain(`<a:blip r:embed="rIdImg1"/>`);
    expect(xml).toContain(`descr="Logo"`);
    const header = docx_parts(SAMPLE_V4, "Report", new Date(0), media)["word/header1.xml"];
    expect(header).toContain(`<wp:docPr id="2" name="Picture 2" descr="Mark"/>`);
  });

  it("prints a header and footer on each page with its number", () => {
    const html = print_document(SAMPLE_V4, "Report", "/inter.woff2", NO_FONTS, { pages: 2, top: 30, bottom: 35 });
    expect(html).toContain("@page{size:A4 landscape;margin:0}");
    expect(html).toContain(".doc{padding:30mm 15mm 35mm 15mm;");
    expect(html).toContain(`<div class="zone head" style="top:222.5mm">`);
    expect(html).toContain(`Page 2 of 2`);
    expect(html).toContain("Jane Doe</strong> · 1</p>");
    expect(html).toContain(`<img src="${PIXEL}" alt="Logo" style="width:40%">`);
    expect(html).toContain(`img-src data:`);
    expect(print_document(SAMPLE_V4, "Report", "/inter.woff2", NO_FONTS, "measure")).toContain(`<html lang="en" class="measure">`);
  });

  it("pushes the body down when a header is taller than its margin leaves room for", () => {
    expect(zone_padding(SAMPLE_V4, 5, 5)).toEqual({ top: 25, bottom: 30 });
    expect(zone_padding(SAMPLE_V4, 20, 5)).toEqual({ top: 12.5 + 20 + 4, bottom: 30 });
  });
});

describe("format 5 exports", () => {
  it("writes tables with their grid, spans, header row and borders", () => {
    const xml = document_xml(SAMPLE_V5);
    const [table, layout] = xml.match(/<w:tbl>.*?<\/w:tbl>/g)!;
    expect(table).toContain(`<w:tblGrid><w:gridCol w:w="4819"/><w:gridCol w:w="2410"/><w:gridCol w:w="2410"/></w:tblGrid>`);
    expect(table).toContain(`<w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>`);
    expect(table).toContain(`<w:tr><w:trPr><w:tblHeader/></w:trPr>`);
    expect(table).toContain(`<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Skill</w:t></w:r>`);
    expect(table).toContain(`<w:tcPr><w:tcW w:w="4819" w:type="dxa"/><w:vMerge w:val="restart"/></w:tcPr>`);
    expect(table).toContain(`<w:tcPr><w:tcW w:w="4820" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr>`);
    expect(table).toContain(`<w:tc><w:tcPr><w:tcW w:w="4819" w:type="dxa"/><w:vMerge/></w:tcPr><w:p/></w:tc>`);
    expect(table).toContain(`<w:numPr>`);
    expect(layout).toContain(`<w:top w:val="nil"/>`);
    expect(layout).toContain(`<w:left w:w="0" w:type="dxa"/>`);
    expect(numbering_xml(SAMPLE_V5)).toContain(`<w:num w:numId="1">`);
  });

  it("writes title and quote paragraphs, text colour and highlight", () => {
    const xml = document_xml(SAMPLE_V5);
    expect(xml).toContain(`<w:pPr><w:pStyle w:val="Title"/><w:jc w:val="center"/></w:pPr>`);
    expect(xml).toContain(`<w:pPr><w:pStyle w:val="Quote"/></w:pPr>`);
    expect(xml).toContain(`<w:rPr><w:color w:val="C00000"/></w:rPr><w:t xml:space="preserve">Red</w:t>`);
    expect(xml).toContain(`<w:rPr><w:b/><w:bCs/><w:shd w:val="clear" w:color="auto" w:fill="FFF3A3"/></w:rPr><w:t xml:space="preserve">marked</w:t>`);
  });

  it("writes the document's named styles", () => {
    const xml = styles_xml("Inter", resolve_styles(SAMPLE_V5.styles));
    expect(xml).toContain(`<w:sz w:val="21"/><w:szCs w:val="21"/><w:lang w:val="en-GB"/>`);
    expect(xml).toMatch(/w:styleId="Normal">.*?<w:color w:val="222222"\/><w:sz w:val="21"\/>/);
    expect(xml).toMatch(/w:styleId="Heading1">.*?<w:jc w:val="center"\/><w:outlineLvl w:val="0"\/><\/w:pPr><w:rPr><w:b\/><w:bCs\/><w:color w:val="1971C2"\/>/);
    expect(xml).toMatch(/w:styleId="Title">.*?<w:rFonts w:ascii="Burrow"/);
    expect(xml).toMatch(/w:styleId="Quote">.*?<w:pBdr>.*?<w:spacing [^>]*\/><w:ind w:left="180"\/>.*?<w:i\/><w:iCs\/>/);
    expect(docx_parts(SAMPLE_V5, "CV")["word/styles.xml"]).toBe(xml);
  });

  it("prints tables with their widths, header and borders, and the styles as CSS", () => {
    const html = body_html(SAMPLE_V5);
    expect(html).toContain(`<p class="wr-title" style="text-align:center">Jane Doe</p><blockquote>Make it simple.</blockquote>`);
    expect(html).toContain(`<span style="color:#c00000">Red</span>`);
    expect(html).toContain(`<strong><span style="background-color:#fff3a3">marked</span></strong>`);
    expect(html).toContain(`<table class="wr-table"><colgroup><col style="width:50%"><col style="width:25%"><col style="width:25%"></colgroup><thead><tr><th><p>Skill</p></th>`);
    expect(html).toContain(`<tbody><tr><td rowspan="2"><p>Writing</p></td><td colspan="2"><p><strong>Expert</strong></p></td></tr>`);
    expect(html).toContain(`<table class="wr-table" data-borders="off">`);
    const css = document_css(".doc", resolve_styles(SAMPLE_V5.styles));
    expect(css).toContain(".doc{font-family:Inter,Inter,ui-sans-serif,system-ui,sans-serif;font-size:10.5pt;");
    expect(css).toContain("color:#222222;");
    expect(css).toContain(`.doc p.wr-title{font-size:28pt;font-weight:700;font-style:normal;line-height:1.15;margin:0pt 0 10pt;font-family:"warren-font-burrow",Inter}`);
    expect(css).toContain(".doc h1{font-size:22pt;font-weight:700;font-style:normal;line-height:1.2;margin:17.6pt 0 6pt;color:#1971c2;text-align:center}");
  });
});
