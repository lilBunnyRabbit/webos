import { style_colour } from "./colour";
import type { DocNode, EditorJson } from "./format";
import { column_percents } from "./table";

export const PAGE_BREAK = "page-break";
export const RULE = "horizontalrule";
export const LINK_TYPES = ["link", "autolink"];
export const IMAGE = "image";
export const TABLE = "table";
export const TITLE = "title";
export const QUOTE = "quote";

// Like Proposals' pictures, but a page gets printed: a longer edge and a little more quality.
export const PICTURE = { max_side: 1600, quality: 0.82 } as const;

// Lexical's TextNode format bits.
export const BOLD = 1;
export const ITALIC = 1 << 1;
export const STRIKETHROUGH = 1 << 2;
export const UNDERLINE = 1 << 3;
export const SUBSCRIPT = 1 << 5;
export const SUPERSCRIPT = 1 << 6;

export const Script = { SUB: "sub", SUPER: "super" } as const;
export type Script = (typeof Script)[keyof typeof Script];

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  script: Script | null;
  /** Points; `null` is the block's own size. */
  size: number | null;
  link: string | null;
  color: string | null;
  highlight: string | null;
}

export const ListKind = { BULLET: "bullet", NUMBER: "number", CHECK: "check" } as const;
export type ListKind = (typeof ListKind)[keyof typeof ListKind];

export const Align = { LEFT: "left", CENTER: "center", RIGHT: "right", JUSTIFY: "justify" } as const;
export type Align = (typeof Align)[keyof typeof Align];
export const ALIGNS = Object.values(Align);

export interface TableCell {
  col_span: number;
  row_span: number;
  header: boolean;
  blocks: Block[];
}

export interface TableBlock {
  kind: "table";
  borders: boolean;
  /** Percent of the table's width per grid column, adding up to 100. */
  widths: number[];
  rows: TableCell[][];
}

export type Block =
  | { kind: "paragraph"; align: Align | null; runs: Run[] }
  | { kind: "title"; align: Align | null; runs: Run[] }
  | { kind: "quote"; align: Align | null; runs: Run[] }
  | { kind: "heading"; level: 1 | 2 | 3; align: Align | null; runs: Run[] }
  | { kind: "item"; list: ListKind; level: number; list_id: number; start: number; checked: boolean; align: Align | null; runs: Run[] }
  | { kind: "page-break" }
  | { kind: "rule" }
  | { kind: "image"; src: string; width: number; align: ImageAlign; alt: string }
  | TableBlock;

/** Blocks that hold runs of text, as opposed to page breaks, rules, pictures and tables. */
export type TextBlock = Exclude<Block, { kind: "page-break" } | { kind: "rule" } | { kind: "image" } | TableBlock>;

export function has_text(block: Block): block is TextBlock {
  return block.kind !== "page-break" && block.kind !== "rule" && block.kind !== "image" && block.kind !== "table";
}

// Lexical's `TableCellHeaderStates.ROW`.
export const HEADER_ROW = 1;

// Borderless is for layout (a two-column CV), so borders are on unless the table's NodeState says otherwise.
export function table_borders(node: DocNode): boolean {
  return node.$?.borders !== false;
}

export type ImageAlign = Exclude<Align, "justify">;
export const IMAGE_ALIGNS: readonly ImageAlign[] = [Align.LEFT, Align.CENTER, Align.RIGHT];
/** A picture's width as a percentage of the text column. */
export const IMAGE_WIDTH = { MIN: 5, MAX: 100, DEFAULT: 50 } as const;

export function image_width(value: unknown): number {
  const width = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : IMAGE_WIDTH.DEFAULT;
  return Math.min(IMAGE_WIDTH.MAX, Math.max(IMAGE_WIDTH.MIN, width));
}

export function image_align(value: unknown): ImageAlign {
  return IMAGE_ALIGNS.find((align) => align === value) ?? Align.CENTER;
}

// Only pictures carried inside the document leave Warren; a pasted remote address would load from the web.
export function safe_image(src: string | undefined): string | null {
  return src && /^data:image\/(png|jpeg|webp|gif);base64,/i.test(src) ? src : null;
}

export function script_of(format: number): Script | null {
  return format & SUBSCRIPT ? Script.SUB : format & SUPERSCRIPT ? Script.SUPER : null;
}

// Lexical's "start" and "end" are left and right here: Warren has no right-to-left text.
export function align_of(node: DocNode): Align | null {
  if (node.format === "start") return Align.LEFT;
  if (node.format === "end") return Align.RIGHT;
  return ALIGNS.find((align) => align === node.format) ?? null;
}

export function font_size(style: string | undefined): number | null {
  const match = style?.match(/font-size:\s*([\d.]+)(pt|px)/);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] === "px" ? 0.75 : 1);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 2) / 2 : null;
}

function runs_of(nodes: DocNode[] | undefined, link: string | null = null): Run[] {
  const runs: Run[] = [];
  for (const node of nodes ?? []) {
    if (node.type === "text" || node.type === "tab") {
      const format = typeof node.format === "number" ? node.format : 0;
      runs.push({
        text: node.type === "tab" ? "\t" : (node.text ?? ""),
        bold: (format & BOLD) !== 0,
        italic: (format & ITALIC) !== 0,
        underline: (format & UNDERLINE) !== 0,
        strike: (format & STRIKETHROUGH) !== 0,
        script: script_of(format),
        size: font_size(node.style),
        link,
        color: style_colour(node.style, "color"),
        highlight: style_colour(node.style, "background-color"),
      });
    } else if (node.type === "linebreak") {
      runs.push({ text: "\n", bold: false, italic: false, underline: false, strike: false, script: null, size: null, link, color: null, highlight: null });
    } else if (node.children) {
      runs.push(...runs_of(node.children, LINK_TYPES.includes(node.type) ? safe_url(node.url) : link));
    }
  }
  return runs;
}

/** Only web and mail links leave Warren: anything else (`javascript:`, `data:`) is dropped from exports. */
export function safe_url(url: string | undefined): string | null {
  return url && /^(https?:|mailto:)/i.test(url.trim()) ? url.trim() : null;
}

/** What the user typed into the link field, as a link: a bare `example.com` becomes `https://example.com`. */
export function normalize_url(text: string): string | null {
  const value = text.trim();
  if (!value || /\s/.test(value)) return null;
  if (/^[a-z][a-z\d+.-]*:/i.test(value)) return safe_url(value);
  if (/^[^@/]+@[^@/]+\.[^@/]+$/.test(value)) return `mailto:${value}`;
  return /^[^/]+\.[^/]+/.test(value) ? `https://${value}` : null;
}

function heading_level(tag: string | undefined): 1 | 2 | 3 {
  const level = Number(tag?.slice(1));
  return level === 1 || level === 2 ? level : 3;
}

export function blocks_of(editor: EditorJson): Block[] {
  return blocks_from(editor.root.children, { lists: 0 });
}

function table_of(node: DocNode, counter: { lists: number }): TableBlock {
  const rows = (node.children ?? [])
    .filter((row) => row.type === "tablerow")
    .map((row) =>
      (row.children ?? [])
        .filter((cell) => cell.type === "tablecell")
        .map((cell) => ({
          col_span: Math.max(1, Math.floor(cell.colSpan ?? 1)),
          row_span: Math.max(1, Math.floor(cell.rowSpan ?? 1)),
          header: ((cell.headerState ?? 0) & HEADER_ROW) !== 0,
          blocks: blocks_from(cell.children ?? [], counter).filter((block) => block.kind !== "page-break"),
        }))
    );
  return { kind: "table", borders: table_borders(node), widths: column_percents(node.colWidths, grid_columns(rows)), rows };
}

// A row holds only the cells that start in it, so the widest row is counted with the cells carried down from above.
export function grid_columns(rows: { col_span: number; row_span: number }[][]): number {
  const taken: number[] = [];
  let columns = 0;
  rows.forEach((cells, index) => {
    const own = cells.reduce((sum, cell) => sum + cell.col_span, 0);
    columns = Math.max(columns, (taken[index] ?? 0) + own);
    for (const cell of cells) for (let below = 1; below < cell.row_span; below++) taken[index + below] = (taken[index + below] ?? 0) + cell.col_span;
  });
  return columns;
}

function blocks_from(nodes: DocNode[], counter: { lists: number }): Block[] {
  const blocks: Block[] = [];

  const list = (node: DocNode, level: number) => {
    const id = ++counter.lists;
    const kind = node.listType === "number" ? ListKind.NUMBER : node.listType === "check" ? ListKind.CHECK : ListKind.BULLET;
    const start = typeof node.start === "number" && node.start > 0 ? Math.floor(node.start) : 1;
    for (const item of node.children ?? []) {
      const nested = (item.children ?? []).filter((child) => child.type === "list");
      const inline = (item.children ?? []).filter((child) => child.type !== "list");
      if (inline.length || !nested.length) blocks.push({ kind: "item", list: kind, level, list_id: id, start, checked: kind === ListKind.CHECK && item.checked === true, align: align_of(item), runs: runs_of(inline) });
      for (const child of nested) list(child, level + 1);
    }
  };

  for (const node of nodes) {
    if (node.type === PAGE_BREAK) blocks.push({ kind: "page-break" });
    else if (node.type === RULE) blocks.push({ kind: "rule" });
    else if (node.type === IMAGE) {
      const src = safe_image(node.src);
      if (src) blocks.push({ kind: "image", src, width: image_width(node.width), align: image_align(node.align), alt: node.alt ?? "" });
    } else if (node.type === TABLE) blocks.push(table_of(node, counter));
    else if (node.type === "heading") blocks.push({ kind: "heading", level: heading_level(node.tag), align: align_of(node), runs: runs_of(node.children) });
    else if (node.type === TITLE || node.type === QUOTE) blocks.push({ kind: node.type, align: align_of(node), runs: runs_of(node.children) });
    else if (node.type === "list") list(node, 0);
    else blocks.push({ kind: "paragraph", align: align_of(node), runs: runs_of(node.children) });
  }
  return blocks;
}

/** Every block in reading order, a table's cells row by row after the table itself. */
export function flat_blocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => (block.kind === "table" ? [block, ...block.rows.flatMap((row) => row.flatMap((cell) => flat_blocks(cell.blocks)))] : [block]));
}

export function document_text(editor: EditorJson): string {
  return flat_blocks(blocks_of(editor))
    .flatMap((block) => (has_text(block) ? [block.runs.map((run) => run.text).join("")] : []))
    .join("\n");
}

// Page fields in headers and footers: typed as text, filled in per page by the exports and the sheets.
export const PAGE_TOKEN = "{page}";
export const PAGES_TOKEN = "{pages}";
export const TOKEN_PATTERN = /\{pages?\}/g;

export function fill_tokens(text: string, page: number, pages: number): string {
  return text.replace(TOKEN_PATTERN, (token) => String(token === PAGE_TOKEN ? page : pages));
}

export function has_tokens(editor: EditorJson | undefined): boolean {
  return !!editor && /\{pages?\}/.test(JSON.stringify(editor));
}

/** A line that is only a page number: "{page}", "Page {page}", "{page} of {pages}", "Page {page} / {pages}". */
export function is_page_number_line(text: string): boolean {
  return /^(page\s*)?\{page\}(\s*(of|\/)\s*\{pages\})?$/i.test(text.trim());
}

/** The alignment of a header's or footer's first line that's only a page number. */
export function page_number_align(editor: EditorJson | undefined): Align | null {
  for (const node of editor?.root.children ?? []) {
    if (node.type !== "paragraph" && node.type !== "heading") continue;
    const text = (node.children ?? []).map((child) => child.text ?? "").join("");
    if (is_page_number_line(text)) return align_of(node) ?? Align.LEFT;
  }
  return null;
}

/** Characters the pictures take in the saved file, in all three parts. */
export function picture_size(document: { editor: EditorJson; header?: EditorJson; footer?: EditorJson }): number {
  let size = 0;
  const walk = (nodes: DocNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === IMAGE && typeof node.src === "string") size += node.src.length;
      walk(node.children);
    }
  };
  for (const part of [document.editor, document.header, document.footer]) if (part) walk(part.root.children);
  return size;
}
