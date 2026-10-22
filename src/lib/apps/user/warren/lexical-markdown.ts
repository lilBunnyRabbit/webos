import { $createHorizontalRuleNode, HorizontalRuleNode } from "@lexical/extension";
import { $createLinkNode } from "@lexical/link";
import {
  $convertFromMarkdownString,
  BOLD_ITALIC_STAR,
  BOLD_ITALIC_UNDERSCORE,
  BOLD_STAR,
  BOLD_UNDERSCORE,
  CHECK_LIST,
  isTableRowDivider,
  ITALIC_STAR,
  ITALIC_UNDERSCORE,
  LINK,
  ORDERED_LIST,
  QUOTE,
  registerMarkdownShortcuts,
  STRIKETHROUGH,
  UNORDERED_LIST,
  type ElementTransformer,
  type MultilineElementTransformer,
  type Transformer,
} from "@lexical/markdown";
import { $createHeadingNode, HeadingNode } from "@lexical/rich-text";
import { $createTableCellNode, $createTableNode, $createTableRowNode, TableCellHeaderStates, TableNode } from "@lexical/table";
import { $createParagraphNode, $createTextNode, $getRoot, type ElementNode, type LexicalEditor } from "lexical";
import { ImageNode, $create_image } from "./image-node";
import { PAGE_BREAK_MARK } from "./markdown";
import { safe_image, safe_url } from "./model";
import { $create_page_break, PageBreakNode } from "./page-break-node";

// Warren has three heading levels; deeper Markdown headings become Heading 3, as pasted h4–h6 do.
const HEADING: ElementTransformer = {
  dependencies: [HeadingNode],
  export: () => null,
  regExp: /^(#{1,6})\s/,
  replace: (parent, children, match, is_import) => {
    const heading = $createHeadingNode(`h${Math.min(3, match[1].length) as 1 | 2 | 3}`);
    heading.append(...children);
    parent.replace(heading);
    if (!is_import) heading.select(0, 0);
  },
  triggerOnEnter: true,
  type: "element",
};

const RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: () => null,
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parent, _children, _match, is_import) => {
    const rule = $createHorizontalRuleNode();
    if (is_import || parent.getNextSibling()) parent.replace(rule);
    else parent.insertBefore(rule);
    if (!is_import) rule.selectNext();
  },
  triggerOnEnter: true,
  type: "element",
};

const PAGE_BREAK: ElementTransformer = {
  dependencies: [PageBreakNode],
  export: () => null,
  regExp: new RegExp(`^${PAGE_BREAK_MARK.replace(/ /g, "\\s*")}\\s*$`, "i"),
  replace: (parent, _children, _match, is_import) => {
    if (!is_import) return false;
    parent.replace($create_page_break());
  },
  type: "element",
};

export interface MarkdownImport {
  pictures_left: number;
}

function picture_transformer(report: MarkdownImport): ElementTransformer {
  return {
    dependencies: [ImageNode],
    export: () => null,
    regExp: /^!\[((?:\\.|[^\]\\])*)\]\(\s*<?([^\s>)]+)>?\s*\)\s*$/,
    replace: (parent, _children, match, is_import) => {
      if (!is_import) return false;
      const alt = match[1].replace(/\\(.)/g, "$1");
      const src = safe_image(match[2]);
      if (src) {
        parent.replace($create_image({ src, alt }));
        return;
      }
      report.pictures_left++;
      const paragraph = $createParagraphNode();
      const url = safe_url(match[2]);
      const text = $createTextNode(alt || match[2]);
      paragraph.append(url ? $createLinkNode(url).append(text) : text);
      parent.replace(paragraph);
    },
    type: "element",
  };
}

const ROW = /^\s*\|.*\|\s*$/;

function split_row(line: string): string[] {
  const inner = line.trim().slice(1, -1);
  return inner.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

// GFM tables. The header row is a header row unless it's empty, which is how Warren writes a table without one.
function table_transformer(cell_transformers: () => Transformer[]): MultilineElementTransformer {
  return {
    dependencies: [TableNode],
    regExpStart: ROW,
    replace: () => false,
    handleImportAfterStartMatch: ({ lines, rootNode, startLineIndex }) => {
      if (!isTableRowDivider(lines[startLineIndex + 1]?.trim() ?? "")) return null;
      let end = startLineIndex + 2;
      while (end < lines.length && ROW.test(lines[end])) end++;
      const head = split_row(lines[startLineIndex]);
      const body = lines.slice(startLineIndex + 2, end).map(split_row);
      const rows = head.some(Boolean) ? [head, ...body] : body;
      const columns = Math.max(...rows.map((row) => row.length), head.length);
      const table = $createTableNode();
      rows.forEach((cells, index) => {
        const row = $createTableRowNode();
        const header = index === 0 && rows[0] === head;
        for (let column = 0; column < columns; column++) {
          const cell = $createTableCellNode(header ? TableCellHeaderStates.ROW : TableCellHeaderStates.NO_STATUS);
          fill_cell(cell, cells[column] ?? "", cell_transformers());
          row.append(cell);
        }
        table.append(row);
      });
      if (rows.length) rootNode.append(table);
      return [true, end - 1];
    },
    type: "multiline-element",
  };
}

function fill_cell(cell: ElementNode, text: string, transformers: Transformer[]) {
  const markdown = text.replace(/<br\s*\/?>/gi, "\n\n");
  if (markdown.trim()) $convertFromMarkdownString(markdown, transformers, cell, false, true);
  if (cell.isEmpty()) cell.append($createParagraphNode());
}

// Order matters: a check item is a bullet with a box, so it goes first.
const BLOCKS: Transformer[] = [HEADING, QUOTE, CHECK_LIST, UNORDERED_LIST, ORDERED_LIST, RULE];
const TEXT: Transformer[] = [BOLD_ITALIC_STAR, BOLD_ITALIC_UNDERSCORE, BOLD_STAR, BOLD_UNDERSCORE, ITALIC_STAR, ITALIC_UNDERSCORE, STRIKETHROUGH, LINK];

export const SHORTCUTS: Transformer[] = [...BLOCKS, ...TEXT];

export function register_markdown(editor: LexicalEditor): () => void {
  return registerMarkdownShortcuts(editor, SHORTCUTS);
}

function import_transformers(report: MarkdownImport): Transformer[] {
  const picture = picture_transformer(report);
  const cells: Transformer[] = [...BLOCKS, picture, ...TEXT];
  return [table_transformer(() => cells), PAGE_BREAK, picture, ...BLOCKS, ...TEXT];
}

export function $load_markdown(text: string): MarkdownImport {
  const report: MarkdownImport = { pictures_left: 0 };
  const root = $getRoot();
  $convertFromMarkdownString(text.replace(/\r\n?/g, "\n"), import_transformers(report), root, false, true);
  if (root.isEmpty()) root.append($createParagraphNode());
  return report;
}
