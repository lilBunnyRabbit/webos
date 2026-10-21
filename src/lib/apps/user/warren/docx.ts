import { font_label } from "$lib/core/api/services/settings/fonts";
import type { FontChoice } from "$lib/core/api/services/settings/type";
import { Method } from "$lib/core/utils/zip/format";
import { write_zip } from "$lib/core/utils/zip/write";
import type { WarrenDocument } from "./format";
import { blocks_of, ListKind, type Align, type Block, type Run } from "./model";
import { BASE_PT, HEADING_PT, LINE_HEIGHT, PAGE_MM, PARAGRAPH_AFTER_PT, mm_to_twips } from "./page";

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
const LEVELS = 9;
const BULLETS = ["•", "◦", "▪"];
const NUMBERS = ["decimal", "lowerLetter", "lowerRoman"];
const JUSTIFICATION: Record<Align, string> = { left: "left", center: "center", right: "right", justify: "both" };

export function escape_xml(text: string): string {
  return text
    .replace(/[^\t\n\r -퟿-�\u{10000}-\u{10FFFF}]/gu, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const half_points = (pt: number) => Math.round(pt * 2);
const twips = (pt: number) => Math.round(pt * 20);

/** The family the .docx names; Word substitutes it when it isn't installed. */
export function font_name(font: FontChoice | undefined): string {
  return font ? font_label(font, "sans") : "Inter";
}

function run_xml(run: Run): string {
  const props = [
    run.link && `<w:rStyle w:val="Hyperlink"/>`,
    run.bold && "<w:b/><w:bCs/>",
    run.italic && "<w:i/><w:iCs/>",
    run.strike && "<w:strike/>",
    run.underline && `<w:u w:val="single"/>`,
    run.size !== null && `<w:sz w:val="${half_points(run.size)}"/><w:szCs w:val="${half_points(run.size)}"/>`,
  ]
    .filter(Boolean)
    .join("");
  const content = run.text
    .split(/(\n|\t)/)
    .filter((part) => part !== "")
    .map((part) => (part === "\n" ? "<w:br/>" : part === "\t" ? "<w:tab/>" : `<w:t xml:space="preserve">${escape_xml(part)}</w:t>`))
    .join("");
  return content ? `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}${content}</w:r>` : "";
}

export function link_ids(blocks: Block[]): Map<string, string> {
  const ids = new Map<string, string>();
  for (const block of blocks) {
    if (block.kind === "page-break") continue;
    for (const run of block.runs) if (run.link && !ids.has(run.link)) ids.set(run.link, `rIdLink${ids.size + 1}`);
  }
  return ids;
}

function runs_xml(runs: Run[], links: Map<string, string>): string {
  let xml = "";
  for (let index = 0; index < runs.length; ) {
    const link = runs[index].link;
    let end = index + 1;
    while (end < runs.length && runs[end].link === link) end++;
    const inner = runs.slice(index, end).map(run_xml).join("");
    xml += link ? `<w:hyperlink r:id="${links.get(link)}" w:history="1">${inner}</w:hyperlink>` : inner;
    index = end;
  }
  return xml;
}

interface Numbering {
  nums: { id: number; abstract: number; level: number; start: number }[];
  by_list: Map<number, number>;
}

function numbering_of(blocks: Block[]): Numbering {
  const numbering: Numbering = { nums: [], by_list: new Map() };
  for (const block of blocks) {
    if (block.kind !== "item" || numbering.by_list.has(block.list_id)) continue;
    const id = numbering.nums.length + 1;
    numbering.nums.push({ id, abstract: block.list === ListKind.NUMBER ? 1 : 0, level: block.level, start: block.start });
    numbering.by_list.set(block.list_id, id);
  }
  return numbering;
}

function paragraph_xml(block: Exclude<Block, { kind: "page-break" }>, numbering: Numbering, links: Map<string, string>, break_before: boolean): string {
  // `w:pPr` children have a fixed order in the schema: style, page break, numbering, justification.
  const props: string[] = [];
  if (block.kind === "heading") props.push(`<w:pStyle w:val="Heading${block.level}"/>`);
  if (block.kind === "item") props.push(`<w:pStyle w:val="ListParagraph"/>`);
  if (break_before) props.push("<w:pageBreakBefore/>");
  if (block.kind === "item") {
    props.push(`<w:numPr><w:ilvl w:val="${Math.min(block.level, LEVELS - 1)}"/><w:numId w:val="${numbering.by_list.get(block.list_id)}"/></w:numPr>`);
  }
  if (block.align) props.push(`<w:jc w:val="${JUSTIFICATION[block.align]}"/>`);
  return `<w:p>${props.length ? `<w:pPr>${props.join("")}</w:pPr>` : ""}${runs_xml(block.runs, links)}</w:p>`;
}

export function document_xml(document: WarrenDocument): string {
  const blocks = blocks_of(document.editor);
  const numbering = numbering_of(blocks);
  const links = link_ids(blocks);
  const body: string[] = [];
  let pending_break = false;
  for (const block of blocks) {
    if (block.kind === "page-break") {
      if (pending_break) body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
      pending_break = true;
      continue;
    }
    body.push(paragraph_xml(block, numbering, links, pending_break));
    pending_break = false;
  }
  if (pending_break) body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
  const page = PAGE_MM[document.page.size];
  const margin = mm_to_twips(page.margin);
  const section =
    `<w:sectPr><w:pgSz w:w="${mm_to_twips(page.width)}" w:h="${mm_to_twips(page.height)}"/>` +
    `<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  return `${HEAD}<w:document xmlns:w="${W}" xmlns:r="${R}"><w:body>${body.join("")}${section}</w:body></w:document>`;
}

function heading_style(level: 1 | 2 | 3): string {
  return (
    `<w:style w:type="paragraph" w:styleId="Heading${level}"><w:name w:val="heading ${level}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:spacing w:before="${twips(HEADING_PT[level] * 0.8)}" w:after="${twips(PARAGRAPH_AFTER_PT)}"/><w:outlineLvl w:val="${level - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:bCs/><w:sz w:val="${half_points(HEADING_PT[level])}"/><w:szCs w:val="${half_points(HEADING_PT[level])}"/></w:rPr></w:style>`
  );
}

export function styles_xml(font: string): string {
  const family = escape_xml(font);
  const line = Math.round(LINE_HEIGHT * 240);
  return (
    `${HEAD}<w:styles xmlns:w="${W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${family}" w:cs="${family}"/>` +
    `<w:sz w:val="${half_points(BASE_PT)}"/><w:szCs w:val="${half_points(BASE_PT)}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="${twips(PARAGRAPH_AFTER_PT)}" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    heading_style(1) +
    heading_style(2) +
    heading_style(3) +
    `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:after="${twips(PARAGRAPH_AFTER_PT / 3)}"/><w:contextualSpacing/></w:pPr></w:style>` +
    `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:u w:val="single"/></w:rPr></w:style>` +
    `</w:styles>`
  );
}

function abstract_xml(id: number, kind: ListKind): string {
  const levels = Array.from({ length: LEVELS }, (_, level) => {
    const indent = 720 * (level + 1);
    const format =
      kind === ListKind.BULLET
        ? `<w:numFmt w:val="bullet"/><w:lvlText w:val="${BULLETS[level % BULLETS.length]}"/>`
        : `<w:numFmt w:val="${NUMBERS[level % NUMBERS.length]}"/><w:lvlText w:val="%${level + 1}."/>`;
    return `<w:lvl w:ilvl="${level}"><w:start w:val="1"/>${format}<w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${indent}" w:hanging="360"/></w:pPr></w:lvl>`;
  }).join("");
  return `<w:abstractNum w:abstractNumId="${id}"><w:multiLevelType w:val="hybridMultilevel"/>${levels}</w:abstractNum>`;
}

export function numbering_xml(document: WarrenDocument): string {
  const { nums } = numbering_of(blocks_of(document.editor));
  const instances = nums
    .map(
      (num) =>
        `<w:num w:numId="${num.id}"><w:abstractNumId w:val="${num.abstract}"/>` +
        `<w:lvlOverride w:ilvl="${Math.min(num.level, LEVELS - 1)}"><w:startOverride w:val="${num.start}"/></w:lvlOverride></w:num>`
    )
    .join("");
  return `${HEAD}<w:numbering xmlns:w="${W}">${abstract_xml(0, ListKind.BULLET)}${abstract_xml(1, ListKind.NUMBER)}${instances}</w:numbering>`;
}

export const CONTENT_TYPES =
  `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
  `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
  `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
  `</Types>`;

export const PACKAGE_RELS =
  `${HEAD}<Relationships xmlns="${REL}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `</Relationships>`;

export function document_rels(document: WarrenDocument): string {
  const links = [...link_ids(blocks_of(document.editor))]
    .map(([url, id]) => `<Relationship Id="${id}" Type="${R}/hyperlink" Target="${escape_xml(url)}" TargetMode="External"/>`)
    .join("");
  return (
    `${HEAD}<Relationships xmlns="${REL}">` +
    `<Relationship Id="rId1" Type="${R}/styles" Target="styles.xml"/>` +
    `<Relationship Id="rId2" Type="${R}/numbering" Target="numbering.xml"/>` +
    `${links}</Relationships>`
  );
}

export function core_xml(title: string, now: Date): string {
  const stamp = now.toISOString().replace(/\.\d+Z$/, "Z");
  return (
    `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${escape_xml(title)}</dc:title><dc:creator>Warren</dc:creator>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>` +
    `</cp:coreProperties>`
  );
}

export function docx_parts(document: WarrenDocument, title: string, now = new Date()): Record<string, string> {
  return {
    "[Content_Types].xml": CONTENT_TYPES,
    "_rels/.rels": PACKAGE_RELS,
    "docProps/core.xml": core_xml(title, now),
    "word/document.xml": document_xml(document),
    "word/styles.xml": styles_xml(font_name(document.page.font)),
    "word/numbering.xml": numbering_xml(document),
    "word/_rels/document.xml.rels": document_rels(document),
  };
}

export async function build_docx(document: WarrenDocument, title: string): Promise<Blob> {
  const now = new Date();
  const sources = Object.entries(docx_parts(document, title, now)).map(([name, xml]) => ({ name, data: new Blob([xml]), modified: now }));
  const zip = await write_zip(sources, { method: Method.DEFLATE });
  return new Blob([zip], { type: DOCX_TYPE });
}
