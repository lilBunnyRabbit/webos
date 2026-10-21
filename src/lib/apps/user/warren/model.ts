import type { DocNode, EditorJson } from "./format";

export const PAGE_BREAK = "page-break";

// Lexical's TextNode format bits.
export const BOLD = 1;
export const ITALIC = 1 << 1;
export const STRIKETHROUGH = 1 << 2;
export const UNDERLINE = 1 << 3;

export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  /** Points; `null` is the block's own size. */
  size: number | null;
}

export const ListKind = { BULLET: "bullet", NUMBER: "number" } as const;
export type ListKind = (typeof ListKind)[keyof typeof ListKind];

export const Align = { LEFT: "left", CENTER: "center", RIGHT: "right", JUSTIFY: "justify" } as const;
export type Align = (typeof Align)[keyof typeof Align];
export const ALIGNS = Object.values(Align);

export type Block =
  | { kind: "paragraph"; align: Align | null; runs: Run[] }
  | { kind: "heading"; level: 1 | 2 | 3; align: Align | null; runs: Run[] }
  | { kind: "item"; list: ListKind; level: number; list_id: number; start: number; align: Align | null; runs: Run[] }
  | { kind: "page-break" };

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

function runs_of(nodes: DocNode[] | undefined): Run[] {
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
        size: font_size(node.style),
      });
    } else if (node.type === "linebreak") {
      runs.push({ text: "\n", bold: false, italic: false, underline: false, strike: false, size: null });
    } else if (node.children) {
      runs.push(...runs_of(node.children));
    }
  }
  return runs;
}

function heading_level(tag: string | undefined): 1 | 2 | 3 {
  const level = Number(tag?.slice(1));
  return level === 1 || level === 2 ? level : 3;
}

export function blocks_of(editor: EditorJson): Block[] {
  const blocks: Block[] = [];
  let lists = 0;

  const list = (node: DocNode, level: number) => {
    const id = ++lists;
    const kind = node.listType === "number" ? ListKind.NUMBER : ListKind.BULLET;
    const start = typeof node.start === "number" && node.start > 0 ? Math.floor(node.start) : 1;
    for (const item of node.children ?? []) {
      const nested = (item.children ?? []).filter((child) => child.type === "list");
      const inline = (item.children ?? []).filter((child) => child.type !== "list");
      if (inline.length || !nested.length) blocks.push({ kind: "item", list: kind, level, list_id: id, start, align: align_of(item), runs: runs_of(inline) });
      for (const child of nested) list(child, level + 1);
    }
  };

  for (const node of editor.root.children) {
    if (node.type === PAGE_BREAK) blocks.push({ kind: "page-break" });
    else if (node.type === "heading") blocks.push({ kind: "heading", level: heading_level(node.tag), align: align_of(node), runs: runs_of(node.children) });
    else if (node.type === "list") list(node, 0);
    else blocks.push({ kind: "paragraph", align: align_of(node), runs: runs_of(node.children) });
  }
  return blocks;
}

export function document_text(editor: EditorJson): string {
  return blocks_of(editor)
    .flatMap((block) => (block.kind === "page-break" ? [] : [block.runs.map((run) => run.text).join("")]))
    .join("\n");
}
