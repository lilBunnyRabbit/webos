import type { EditorJson } from "./format";
import { blocks_of, ListKind, type Block, type Run, type TableBlock } from "./model";
import { grid_rows } from "./table";

export const MARKDOWN_EXTENSIONS = [".md", ".markdown"];
export const MARKDOWN_TYPE = "text/markdown";
/** Markdown has no page break; an HTML comment keeps it invisible in viewers and brings it back on import. */
export const PAGE_BREAK_MARK = "<!-- page break -->";

export function is_markdown(path: string): boolean {
  const lower = path.toLowerCase();
  return MARKDOWN_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function escape(text: string): string {
  return text.replace(/[\\*_~`[\]]/g, "\\$&");
}

function escape_start(line: string): string {
  return line.replace(/^(\s*)(#{1,6}\s|>|[-+]\s|\d+\.\s|\||<!--)/, (_, space: string, mark: string) => `${space}\\${mark}`);
}

interface Marks {
  bold: boolean;
  italic: boolean;
  strike: boolean;
}

const same_marks = (a: Marks, b: Marks) => a.bold === b.bold && a.italic === b.italic && a.strike === b.strike;

// Markers have to hug the text: CommonMark doesn't read `** bold**`, so a run's own spaces go outside them.
function wrap(text: string, marks: Marks): string {
  const open = `${marks.bold ? "**" : ""}${marks.italic ? "*" : ""}${marks.strike ? "~~" : ""}`;
  if (!open) return text;
  const close = [...open.matchAll(/\*\*|\*|~~/g)].map((match) => match[0]).reverse().join("");
  const lead = text.match(/^\s*/)![0];
  const trail = text.slice(lead.length).match(/\s*$/)![0];
  const core = text.slice(lead.length, text.length - trail.length);
  return core ? `${lead}${open}${core}${close}${trail}` : text;
}

function formatted(runs: Run[]): string {
  const parts: string[] = [];
  let text = "";
  let marks: Marks | null = null;
  const flush = () => {
    if (marks && text) parts.push(wrap(text, marks));
    text = "";
  };
  for (const run of runs) {
    if (run.text === "\n") {
      flush();
      parts.push("\\\n");
      marks = null;
      continue;
    }
    const next = { bold: run.bold, italic: run.italic, strike: run.strike };
    if (!marks || !same_marks(marks, next)) {
      flush();
      marks = next;
    }
    text += escape(run.text);
  }
  flush();
  return parts.join("");
}

export function inline(runs: Run[]): string {
  const out: string[] = [];
  for (let index = 0; index < runs.length; ) {
    const link = runs[index].link;
    let end = index + 1;
    while (end < runs.length && runs[end].link === link) end++;
    const group = runs.slice(index, end);
    out.push(link ? `[${formatted(group)}](${link.replace(/[()\\\s]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)})` : formatted(group));
    index = end;
  }
  return out.join("");
}

function cell_text(blocks: Block[]): string {
  return markdown_blocks(blocks)
    .replace(/\\\n/g, "<br>")
    .replace(/\n+/g, "<br>")
    .replace(/\|/g, "\\|")
    .trim();
}

// GFM has no merged cells: a spanned cell's text sits in its first grid cell, the rest are empty. GFM also needs a
// header row, so a table without one gets an empty header, which the importer drops again.
function table_markdown(table: TableBlock): string {
  const { rows, columns } = grid_rows(table.rows);
  if (!columns) return "";
  const lines = rows.map((items) => {
    const cells = Array.from({ length: columns }, () => "");
    for (const item of items) if (!item.continued) cells[item.column] = cell_text(item.cell.blocks);
    return `| ${cells.join(" | ")} |`;
  });
  const header = rows[0]?.length && rows[0].every((item) => item.cell.header);
  const head = header ? lines.shift()! : `|${" |".repeat(columns)}`;
  return [head, `|${" --- |".repeat(columns)}`, ...lines].join("\n");
}

function list_markers(blocks: Block[]): Map<Block, string> {
  const counters = new Map<number, number>();
  const markers = new Map<Block, string>();
  for (const block of blocks) {
    if (block.kind !== "item") continue;
    const indent = "    ".repeat(block.level);
    if (block.list === ListKind.NUMBER) {
      const number = counters.get(block.list_id) ?? block.start;
      counters.set(block.list_id, number + 1);
      markers.set(block, `${indent}${number}. `);
    } else {
      markers.set(block, `${indent}- ${block.list === ListKind.CHECK ? `[${block.checked ? "x" : " "}] ` : ""}`);
    }
  }
  return markers;
}

function block_markdown(block: Block, marker: string | undefined): string | null {
  switch (block.kind) {
    case "page-break":
      return PAGE_BREAK_MARK;
    case "rule":
      return "---";
    case "image":
      return `![${escape(block.alt)}](${block.src})`;
    case "table":
      return table_markdown(block);
    case "title":
      return `# ${inline(block.runs)}`;
    case "heading":
      return `${"#".repeat(block.level)} ${inline(block.runs)}`;
    case "quote":
      return inline(block.runs)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
    case "item":
      return `${marker ?? "- "}${inline(block.runs)}`;
    case "paragraph": {
      const text = inline(block.runs);
      return text.trim() ? text.split("\n").map(escape_start).join("\n") : null;
    }
  }
}

function markdown_blocks(blocks: Block[]): string {
  const markers = list_markers(blocks);
  let out = "";
  let previous: Block | null = null;
  let list: number | null = null;
  for (const block of blocks) {
    const text = block_markdown(block, markers.get(block));
    if (text === null) continue;
    // Items of one list are a line apart; a blank line keeps two lists in a row from reading as one.
    const same_list = previous?.kind === "item" && block.kind === "item" && (block.level > 0 || block.list_id === list);
    if (previous) out += same_list ? "\n" : "\n\n";
    if (block.kind === "item" && block.level === 0) list = block.list_id;
    out += text;
    previous = block;
  }
  return out;
}

/** The body only: underline, sizes, colours, alignment, styles, the header and the footer have no Markdown. */
export function to_markdown(editor: EditorJson): string {
  const text = markdown_blocks(blocks_of(editor));
  return text ? `${text}\n` : "";
}
