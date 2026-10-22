import { BUILTIN_FONTS, font_label } from "$lib/core/api/services/settings/fonts";
import type { FontChoice } from "$lib/core/api/services/settings/type";
import { Method } from "$lib/core/utils/zip/format";
import { write_zip } from "$lib/core/utils/zip/write";
import type { EditorJson, WarrenDocument } from "./format";
import { word_hex } from "./colour";
import { blocks_of, flat_blocks, ListKind, PAGES_TOKEN, PAGE_TOKEN, type Script, type Align, type Block, type Run, type TableBlock, type TextBlock } from "./model";
import { geometry, Orientation, mm_to_twips, zone_distance } from "./page";
import { DEFAULT_STYLES, INTER, resolve_styles, type DocStyles, type StyleSpec } from "./styles";
import { column_percents, grid_rows } from "./table";

export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const REL = "http://schemas.openxmlformats.org/package/2006/relationships";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const NAMESPACES = `xmlns:w="${W}" xmlns:r="${R}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"`;
const HEAD = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n`;
const LEVELS = 9;
const BULLETS = ["•", "◦", "▪"];
const NUMBERS = ["decimal", "lowerLetter", "lowerRoman"];
const JUSTIFICATION: Record<Align, string> = { left: "left", center: "center", right: "right", justify: "both" };
const VERT_ALIGN: Record<Script, string> = { sub: "subscript", super: "superscript" };
const CHECK_INDENT = 360;
const EMU_PER_MM = 36000;
// A rule is an empty paragraph with a bottom border, which is what Word itself writes for "---".
const RULE_BORDER = `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="auto"/></w:pBdr>`;
const FIELDS: Record<string, string> = { [PAGE_TOKEN]: "PAGE", [PAGES_TOKEN]: "NUMPAGES" };
// Cell padding, the same 4 pt by 6 pt the editor and the PDF use.
const CELL_MARGIN = { top: 80, side: 120 };
const STYLE_IDS_DOCX = { title: "Title", quote: "Quote" } as const;

export interface Media {
  file: string;
  width: number;
  height: number;
}

export type MediaMap = ReadonlyMap<string, Media>;

export function escape_xml(text: string): string {
  return text
    .replace(/[^\t\n\r -\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
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

class Rels {
  private readonly items = new Map<string, { id: string; type: string; target: string; external: boolean }>();
  private links = 0;
  private images = 0;

  constructor(base: { id: string; type: string; target: string }[] = []) {
    for (const item of base) this.items.set(item.id, { ...item, external: false });
  }

  link(url: string): string {
    const key = `link:${url}`;
    const found = this.items.get(key);
    if (found) return found.id;
    const id = `rIdLink${++this.links}`;
    this.items.set(key, { id, type: `${R}/hyperlink`, target: url, external: true });
    return id;
  }

  image(media: Media): string {
    const key = `image:${media.file}`;
    const found = this.items.get(key);
    if (found) return found.id;
    const id = `rIdImg${++this.images}`;
    this.items.set(key, { id, type: `${R}/image`, target: `media/${media.file}`, external: false });
    return id;
  }

  add(id: string, type: string, target: string) {
    this.items.set(id, { id, type, target, external: false });
  }

  get size(): number {
    return this.items.size;
  }

  xml(): string {
    const items = [...this.items.values()]
      .map((item) => `<Relationship Id="${item.id}" Type="${item.type}" Target="${escape_xml(item.target)}"${item.external ? ` TargetMode="External"` : ""}/>`)
      .join("");
    return `${HEAD}<Relationships xmlns="${REL}">${items}</Relationships>`;
  }
}

interface Numbering {
  nums: { id: number; abstract: number; level: number; start: number }[];
  by_list: Map<number, number>;
}

interface Part {
  rels: Rels;
  numbering: Numbering;
  media: MediaMap;
  column_mm: number;
  /** `wp:docPr` ids are unique across the whole package. */
  drawings: { next: number };
  fields: boolean;
  /** A header cell's runs are bold, as `th` is on screen. */
  bold: boolean;
}

function run_props(run: Run, bold = false): string {
  // `w:rPr` children have a fixed order in the schema: style, bold, italic, strike, colour, size, underline, shading,
  // vertical alignment.
  const props = [
    run.link && `<w:rStyle w:val="Hyperlink"/>`,
    (run.bold || bold) && "<w:b/><w:bCs/>",
    run.italic && "<w:i/><w:iCs/>",
    run.strike && "<w:strike/>",
    run.color && `<w:color w:val="${word_hex(run.color)}"/>`,
    run.size !== null && `<w:sz w:val="${half_points(run.size)}"/><w:szCs w:val="${half_points(run.size)}"/>`,
    run.underline && `<w:u w:val="single"/>`,
    run.highlight && `<w:shd w:val="clear" w:color="auto" w:fill="${word_hex(run.highlight)}"/>`,
    run.script && `<w:vertAlign w:val="${VERT_ALIGN[run.script]}"/>`,
  ]
    .filter(Boolean)
    .join("");
  return props ? `<w:rPr>${props}</w:rPr>` : "";
}

function text_xml(text: string): string {
  return text
    .split(/(\n|\t)/)
    .filter((part) => part !== "")
    .map((part) => (part === "\n" ? "<w:br/>" : part === "\t" ? "<w:tab/>" : `<w:t xml:space="preserve">${escape_xml(part)}</w:t>`))
    .join("");
}

function run_xml(run: Run, fields: boolean, bold: boolean): string {
  const props = run_props(run, bold);
  return (fields ? run.text.split(/(\{pages?\})/) : [run.text])
    .filter((part) => part !== "")
    .map((part) => (fields && part in FIELDS ? `<w:fldSimple w:instr=" ${FIELDS[part]} "><w:r>${props}<w:t>1</w:t></w:r></w:fldSimple>` : `<w:r>${props}${text_xml(part)}</w:r>`))
    .join("");
}

function runs_xml(runs: Run[], part: Part): string {
  let xml = "";
  for (let index = 0; index < runs.length; ) {
    const link = runs[index].link;
    let end = index + 1;
    while (end < runs.length && runs[end].link === link) end++;
    const inner = runs
      .slice(index, end)
      .map((run) => run_xml(run, part.fields, part.bold))
      .join("");
    xml += link ? `<w:hyperlink r:id="${part.rels.link(link)}" w:history="1">${inner}</w:hyperlink>` : inner;
    index = end;
  }
  return xml;
}

function numbering_of(blocks: Block[], numbering: Numbering = { nums: [], by_list: new Map() }, offset = 0): Numbering {
  for (const block of flat_blocks(blocks)) {
    if (block.kind !== "item" || block.list === ListKind.CHECK || numbering.by_list.has(block.list_id + offset)) continue;
    const id = numbering.nums.length + 1;
    numbering.nums.push({ id, abstract: block.list === ListKind.NUMBER ? 1 : 0, level: block.level, start: block.start });
    numbering.by_list.set(block.list_id + offset, id);
  }
  return numbering;
}

function check_run(checked: boolean): Run {
  return { text: checked ? "☑ " : "☐ ", bold: false, italic: false, underline: false, strike: false, script: null, size: null, link: null, color: null, highlight: null };
}

function paragraph_xml(block: TextBlock, part: Part, break_before: boolean, list_offset: number): string {
  // `w:pPr` children have a fixed order in the schema: style, page break, numbering, indent, justification.
  const props: string[] = [];
  const check = block.kind === "item" && block.list === ListKind.CHECK;
  if (block.kind === "heading") props.push(`<w:pStyle w:val="Heading${block.level}"/>`);
  if (block.kind === "title" || block.kind === "quote") props.push(`<w:pStyle w:val="${STYLE_IDS_DOCX[block.kind]}"/>`);
  // A check item is a plain paragraph: List Paragraph without numbering reads as an unknown style on import.
  if (block.kind === "item" && !check) props.push(`<w:pStyle w:val="ListParagraph"/>`);
  if (break_before) props.push("<w:pageBreakBefore/>");
  if (block.kind === "item" && !check) {
    props.push(`<w:numPr><w:ilvl w:val="${Math.min(block.level, LEVELS - 1)}"/><w:numId w:val="${part.numbering.by_list.get(block.list_id + list_offset)}"/></w:numPr>`);
  }
  if (check && block.level > 0) props.push(`<w:ind w:left="${CHECK_INDENT * 2 * block.level}"/>`);
  if (block.align) props.push(`<w:jc w:val="${JUSTIFICATION[block.align]}"/>`);
  const runs = check ? [check_run(block.checked), ...block.runs] : block.runs;
  return `<w:p>${props.length ? `<w:pPr>${props.join("")}</w:pPr>` : ""}${runs_xml(runs, part)}</w:p>`;
}

function rule_xml(break_before: boolean): string {
  return `<w:p><w:pPr>${break_before ? "<w:pageBreakBefore/>" : ""}${RULE_BORDER}</w:pPr></w:p>`;
}

function image_xml(block: Extract<Block, { kind: "image" }>, part: Part, break_before: boolean): string {
  const media = part.media.get(block.src);
  const props = `<w:pPr>${break_before ? "<w:pageBreakBefore/>" : ""}<w:jc w:val="${JUSTIFICATION[block.align]}"/></w:pPr>`;
  if (!media) return `<w:p>${props}</w:p>`;
  const id = part.rels.image(media);
  const drawing = part.drawings.next++;
  const cx = Math.round(part.column_mm * EMU_PER_MM * (block.width / 100));
  const cy = Math.round((cx * media.height) / Math.max(1, media.width));
  const alt = escape_xml(block.alt);
  return (
    `<w:p>${props}<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${drawing}" name="Picture ${drawing}" descr="${alt}"/>` +
    `<a:graphic><a:graphicData uri="${PIC}"><pic:pic>` +
    `<pic:nvPicPr><pic:cNvPr id="${drawing}" name="${media.file}" descr="${alt}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
  );
}

const BORDER_SIDES = ["top", "left", "bottom", "right", "insideH", "insideV"];

function table_xml(block: TableBlock, part: Part, list_offset: number): string {
  const { rows, columns } = grid_rows(block.rows);
  const widths = block.widths.length === columns ? block.widths : column_percents(undefined, columns);
  const total = mm_to_twips(part.column_mm);
  const grid = widths.map((width) => Math.round((total * width) / 100));
  const border = block.borders ? `w:val="single" w:sz="4" w:space="0" w:color="auto"` : `w:val="nil"`;
  // `w:tblPr` children in the schema's order: width, borders, layout, cell margins.
  const props =
    `<w:tblPr><w:tblW w:w="${grid.reduce((sum, width) => sum + width, 0)}" w:type="dxa"/>` +
    `<w:tblBorders>${BORDER_SIDES.map((side) => `<w:${side} ${border}/>`).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/>` +
    `<w:tblCellMar><w:top w:w="${CELL_MARGIN.top}" w:type="dxa"/><w:left w:w="${block.borders ? CELL_MARGIN.side : 0}" w:type="dxa"/>` +
    `<w:bottom w:w="${CELL_MARGIN.top}" w:type="dxa"/><w:right w:w="${block.borders ? CELL_MARGIN.side : 0}" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  const header_rows = block.rows.findIndex((cells) => !cells.length || !cells.every((cell) => cell.header));
  const leading = header_rows < 0 ? block.rows.length : header_rows;
  const body = rows
    .map((items, index) => {
      const cells = items
        .map((item) => {
          const span = Math.max(1, item.cell.col_span);
          const width = grid.slice(item.column, item.column + span).reduce((sum, value) => sum + value, 0);
          const merge = item.continued ? "<w:vMerge/>" : item.cell.row_span > 1 ? `<w:vMerge w:val="restart"/>` : "";
          const cell_props = `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ""}${merge}</w:tcPr>`;
          const inner = Math.max(1, width - (block.borders ? 2 * CELL_MARGIN.side : 0)) / 1440 * 25.4;
          const content = item.continued ? "<w:p/>" : blocks_xml(item.cell.blocks, { ...part, column_mm: inner, bold: item.cell.header }, list_offset);
          return `<w:tc>${cell_props}${content}</w:tc>`;
        })
        .join("");
      return `<w:tr>${index < leading ? "<w:trPr><w:tblHeader/></w:trPr>" : "<w:trPr><w:cantSplit/></w:trPr>"}${cells}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${props}<w:tblGrid>${grid.map((width) => `<w:gridCol w:w="${width}"/>`).join("")}</w:tblGrid>${body}</w:tbl>`;
}

function blocks_xml(blocks: Block[], part: Part, list_offset = 0): string {
  const body: string[] = [];
  let pending_break = false;
  for (const block of blocks) {
    if (block.kind === "page-break") {
      if (pending_break) body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
      pending_break = !part.fields;
      continue;
    }
    if (block.kind === "table") {
      // A table can't break before itself; the page break goes in an empty paragraph above it.
      if (pending_break) body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
      pending_break = false;
      body.push(table_xml(block, part, list_offset));
      continue;
    }
    if (block.kind === "rule") body.push(rule_xml(pending_break));
    else if (block.kind === "image") body.push(image_xml(block, part, pending_break));
    else body.push(paragraph_xml(block, part, pending_break, list_offset));
    pending_break = false;
  }
  if (pending_break) body.push(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
  // Word wants a paragraph after a table that ends a body, header, footer or cell.
  if (!body.length || body.at(-1)!.startsWith("<w:tbl>")) body.push("<w:p/>");
  return body.join("");
}

interface Plan {
  body: Block[];
  header: Block[] | null;
  footer: Block[] | null;
  numbering: Numbering;
  /** Header and footer list ids are moved past the body's, so their lists number on their own. */
  offsets: { header: number; footer: number };
}

function plan_of(document: WarrenDocument): Plan {
  const body = blocks_of(document.editor);
  const header = document.header ? blocks_of(document.header) : null;
  const footer = document.footer ? blocks_of(document.footer) : null;
  const offsets = { header: 10_000, footer: 20_000 };
  const numbering = numbering_of(body);
  if (header) numbering_of(header, numbering, offsets.header);
  if (footer) numbering_of(footer, numbering, offsets.footer);
  return { body, header, footer, numbering, offsets };
}

export const DOCUMENT_BASE_RELS = [
  { id: "rId1", type: `${R}/styles`, target: "styles.xml" },
  { id: "rId2", type: `${R}/numbering`, target: "numbering.xml" },
];

interface Written {
  document: string;
  rels: Rels;
  header: { xml: string; rels: Rels } | null;
  footer: { xml: string; rels: Rels } | null;
}

function write_parts(document: WarrenDocument, media: MediaMap): Written {
  const plan = plan_of(document);
  const page = geometry(document.page);
  const column_mm = page.width - page.margins.left - page.margins.right;
  const drawings = { next: 1 };
  const part = (rels: Rels, fields: boolean): Part => ({ rels, numbering: plan.numbering, media, column_mm, drawings, fields, bold: false });

  const rels = new Rels(DOCUMENT_BASE_RELS);
  const body = blocks_xml(plan.body, part(rels, false));
  const zone = (blocks: Block[] | null, tag: "hdr" | "ftr", offset: number) => {
    if (!blocks) return null;
    const zone_rels = new Rels();
    const xml = `${HEAD}<w:${tag} ${NAMESPACES}>${blocks_xml(blocks, part(zone_rels, true), offset)}</w:${tag}>`;
    return { xml, rels: zone_rels };
  };
  const header = zone(plan.header, "hdr", plan.offsets.header);
  const footer = zone(plan.footer, "ftr", plan.offsets.footer);
  if (header) rels.add("rIdHeader", `${R}/header`, "header1.xml");
  if (footer) rels.add("rIdFooter", `${R}/footer`, "footer1.xml");

  const { margins } = page;
  const landscape = document.page.orientation === Orientation.LANDSCAPE;
  // `w:sectPr` children have a fixed order: header and footer references first, then size and margins.
  const section =
    `<w:sectPr>${header ? `<w:headerReference w:type="default" r:id="rIdHeader"/>` : ""}${footer ? `<w:footerReference w:type="default" r:id="rIdFooter"/>` : ""}` +
    `<w:pgSz w:w="${mm_to_twips(page.width)}" w:h="${mm_to_twips(page.height)}"${landscape ? ` w:orient="landscape"` : ""}/>` +
    `<w:pgMar w:top="${mm_to_twips(margins.top)}" w:right="${mm_to_twips(margins.right)}" w:bottom="${mm_to_twips(margins.bottom)}" w:left="${mm_to_twips(margins.left)}" ` +
    `w:header="${mm_to_twips(zone_distance(margins.top))}" w:footer="${mm_to_twips(zone_distance(margins.bottom))}" w:gutter="0"/></w:sectPr>`;
  return {
    document: `${HEAD}<w:document ${NAMESPACES}><w:body>${body}${section}</w:body></w:document>`,
    rels,
    header,
    footer,
  };
}

export function document_xml(document: WarrenDocument, media: MediaMap = new Map()): string {
  return write_parts(document, media).document;
}

function style_font(font: string): string {
  return font === INTER ? "Inter" : (BUILTIN_FONTS[font]?.name ?? "Inter");
}

const fonts_xml = (family: string) => `<w:rFonts w:ascii="${family}" w:hAnsi="${family}" w:eastAsia="${family}" w:cs="${family}"/>`;

// A style is based on Normal, so a field only needs writing where it differs from Normal's (or from Word's defaults,
// for Normal itself, which is based on the document defaults).
function style_props(spec: StyleSpec, normal: StyleSpec | null, paragraph: string[] = [], outline: number | null = null, indent: string[] = []): string {
  const differs = <K extends keyof StyleSpec>(key: K) => !normal || spec[key] !== normal[key];
  const run = [
    spec.font && differs("font") && fonts_xml(escape_xml(style_font(spec.font))),
    differs("bold") && (spec.bold ? "<w:b/><w:bCs/>" : normal && `<w:b w:val="0"/><w:bCs w:val="0"/>`),
    differs("italic") && (spec.italic ? "<w:i/><w:iCs/>" : normal && `<w:i w:val="0"/><w:iCs w:val="0"/>`),
    differs("color") && `<w:color w:val="${spec.color ? word_hex(spec.color) : "auto"}"/>`,
    `<w:sz w:val="${half_points(spec.size)}"/><w:szCs w:val="${half_points(spec.size)}"/>`,
  ]
    .filter(Boolean)
    .join("");
  // `w:pPr` children in the schema's order: keep with next, borders, spacing, indent, justification, outline level.
  const para = [
    ...paragraph,
    `<w:spacing w:before="${twips(spec.before)}" w:after="${twips(spec.after)}" w:line="${Math.round(spec.line * 240)}" w:lineRule="auto"/>`,
    ...indent,
    spec.align && `<w:jc w:val="${JUSTIFICATION[spec.align]}"/>`,
    outline !== null && `<w:outlineLvl w:val="${outline}"/>`,
  ]
    .filter(Boolean)
    .join("");
  return `<w:pPr>${para}</w:pPr><w:rPr>${run}</w:rPr>`;
}

function named_style(id: string, name: string, props: string): string {
  return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/>${props}</w:style>`;
}

const QUOTE_BORDER = `<w:pBdr><w:left w:val="single" w:sz="16" w:space="8" w:color="auto"/></w:pBdr>`;

export function styles_xml(font: string, styles: DocStyles = DEFAULT_STYLES): string {
  const family = escape_xml(font);
  const { normal } = styles;
  const heading = (level: 1 | 2 | 3) => named_style(`Heading${level}`, `heading ${level}`, style_props(styles[`h${level}`], normal, ["<w:keepNext/>"], level - 1));
  return (
    `${HEAD}<w:styles xmlns:w="${W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>${fonts_xml(family)}` +
    `<w:sz w:val="${half_points(normal.size)}"/><w:szCs w:val="${half_points(normal.size)}"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="${twips(normal.after)}" w:line="${Math.round(normal.line * 240)}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/>${style_props(normal, null)}</w:style>` +
    named_style("Title", "Title", style_props(styles.title, normal, ["<w:keepNext/>"])) +
    heading(1) +
    heading(2) +
    heading(3) +
    named_style("Quote", "Quote", style_props(styles.quote, normal, [QUOTE_BORDER], null, [`<w:ind w:left="${twips(9)}"/>`])) +
    `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/>` +
    `<w:pPr><w:spacing w:after="${twips(normal.after / 3)}"/><w:contextualSpacing/></w:pPr></w:style>` +
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
  const { nums } = plan_of(document).numbering;
  const instances = nums
    .map(
      (num) =>
        `<w:num w:numId="${num.id}"><w:abstractNumId w:val="${num.abstract}"/>` +
        `<w:lvlOverride w:ilvl="${Math.min(num.level, LEVELS - 1)}"><w:startOverride w:val="${num.start}"/></w:lvlOverride></w:num>`
    )
    .join("");
  return `${HEAD}<w:numbering xmlns:w="${W}">${abstract_xml(0, ListKind.BULLET)}${abstract_xml(1, ListKind.NUMBER)}${instances}</w:numbering>`;
}

const MEDIA_TYPES: Record<string, string> = { png: "image/png", jpeg: "image/jpeg" };

export function content_types(written: { header: unknown; footer: unknown }, media: MediaMap): string {
  const extensions = new Set([...media.values()].map((item) => item.file.split(".").pop() ?? ""));
  return (
    `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    [...extensions].map((extension) => `<Default Extension="${extension}" ContentType="${MEDIA_TYPES[extension] ?? "application/octet-stream"}"/>`).join("") +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>` +
    (written.header ? `<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>` : "") +
    (written.footer ? `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` : "") +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `</Types>`
  );
}

export const PACKAGE_RELS =
  `${HEAD}<Relationships xmlns="${REL}">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
  `</Relationships>`;

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

export function docx_parts(document: WarrenDocument, title: string, now = new Date(), media: MediaMap = new Map()): Record<string, string> {
  const written = write_parts(document, media);
  return {
    "[Content_Types].xml": content_types(written, media),
    "_rels/.rels": PACKAGE_RELS,
    "docProps/core.xml": core_xml(title, now),
    "word/document.xml": written.document,
    "word/styles.xml": styles_xml(font_name(document.page.font), resolve_styles(document.styles)),
    "word/numbering.xml": numbering_xml(document),
    "word/_rels/document.xml.rels": written.rels.xml(),
    ...(written.header ? { "word/header1.xml": written.header.xml } : {}),
    ...(written.header?.rels.size ? { "word/_rels/header1.xml.rels": written.header.rels.xml() } : {}),
    ...(written.footer ? { "word/footer1.xml": written.footer.xml } : {}),
    ...(written.footer?.rels.size ? { "word/_rels/footer1.xml.rels": written.footer.rels.xml() } : {}),
  };
}

export function picture_sources(document: WarrenDocument): string[] {
  const parts: (EditorJson | undefined)[] = [document.editor, document.header, document.footer];
  const sources = parts.flatMap((part) => (part ? flat_blocks(blocks_of(part)) : [])).flatMap((block) => (block.kind === "image" ? [block.src] : []));
  return [...new Set(sources)];
}

export async function build_docx(document: WarrenDocument, title: string): Promise<Blob> {
  const now = new Date();
  const sources = picture_sources(document);
  const pictures = sources.length ? await (await import("./docx-media")).encode_media(sources) : new Map();
  const media = new Map([...pictures].map(([src, item]) => [src, { file: item.file, width: item.width, height: item.height }]));
  const entries = Object.entries(docx_parts(document, title, now, media)).map(([name, xml]) => ({ name, data: new Blob([xml]), modified: now }));
  const files = [...pictures.values()].map((item) => ({ name: `word/media/${item.file}`, data: item.data, modified: now }));
  const zip = await write_zip([...entries, ...files], { method: Method.DEFLATE });
  return new Blob([zip], { type: DOCX_TYPE });
}

