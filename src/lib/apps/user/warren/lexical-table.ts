import {
  $computeTableMapSkipCellCheck,
  $createTableNodeWithDimensions,
  $deleteTableColumnAtSelection,
  $deleteTableRowAtSelection,
  $findTableNode,
  $getTableCellNodeRect,
  $insertTableColumnAtNode,
  $insertTableColumnAtSelection,
  $insertTableRowAtNode,
  $insertTableRowAtSelection,
  $isTableCellNode,
  $isTableNode,
  $isTableSelection,
  $mergeCells,
  $setTableRowIsHeader,
  $unmergeCell,
  INSERT_TABLE_COMMAND,
  TableCellHeaderStates,
  TableNode,
  type TableCellNode,
} from "@lexical/table";
import { $findMatchingParent, $insertNodeToNearestRoot, mergeRegister } from "@lexical/utils";
import {
  $createParagraphNode,
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $getState,
  $isRangeSelection,
  $isRootNode,
  $setState,
  COMMAND_PRIORITY_LOW,
  createState,
  PASTE_COMMAND,
  type EditorState,
  type LexicalEditor,
  type LexicalNode,
  type NodeKey,
} from "lexical";
import { column_percents, parse_tsv } from "./table";

const borders_state = createState("borders", { parse: (value) => value !== false });

export interface TableInfo {
  key: NodeKey;
  rows: number;
  columns: number;
  row: number;
  column: number;
  /** The last grid column the caret's cell covers, whose width the presets set. */
  column_end: number;
  header: boolean;
  borders: boolean;
  widths: number[];
  can_merge: boolean;
  can_split: boolean;
}

function $table_of(node: LexicalNode | null | undefined): TableNode | null {
  return node ? $findTableNode(node) : null;
}

function $cell_of(node: LexicalNode | null | undefined): TableCellNode | null {
  return node ? $findMatchingParent(node, $isTableCellNode) : null;
}

function $grid(table: TableNode) {
  const [map] = $computeTableMapSkipCellCheck(table, null, null);
  return map;
}

function $header_row(table: TableNode): boolean {
  const first = $grid(table)[0];
  return !!first?.length && first.every((value) => value.cell.hasHeaderState(TableCellHeaderStates.ROW));
}

export function read_table(state: EditorState): TableInfo | null {
  return state.read(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) && !$isTableSelection(selection)) return null;
    const cell = $cell_of(selection.anchor.getNode());
    const table = $table_of(cell);
    if (!cell || !table) return null;
    const map = $grid(table);
    const columns = map[0]?.length ?? 0;
    const rect = $getTableCellNodeRect(cell);
    const cells = $isTableSelection(selection) ? selection.getNodes().filter($isTableCellNode) : [];
    return {
      key: table.getKey(),
      rows: map.length,
      columns,
      row: rect?.rowIndex ?? 0,
      column: rect?.columnIndex ?? 0,
      column_end: (rect?.columnIndex ?? 0) + (rect?.colSpan ?? 1) - 1,
      header: $header_row(table),
      borders: $getState(table, borders_state),
      widths: column_percents(table.getColWidths(), columns),
      can_merge: cells.length > 1,
      can_split: cell.getColSpan() > 1 || cell.getRowSpan() > 1,
    };
  });
}

/** Grid widths and whether borders show, put on the `<table>` after each render: Lexical writes widths in pixels. */
function paint(editor: LexicalEditor, key: NodeKey) {
  const element = editor.getElementByKey(key);
  const table = element instanceof HTMLTableElement ? element : element?.querySelector("table");
  if (!table) return;
  const node = $getNodeByKey(key);
  if (!$isTableNode(node)) return;
  if ($getState(node, borders_state)) table.removeAttribute("data-borders");
  else table.setAttribute("data-borders", "off");
  const widths = node.getColWidths();
  if (!widths) return;
  const percents = column_percents(widths, node.getColumnCount());
  table.querySelectorAll<HTMLElement>(":scope > colgroup > col").forEach((col, index) => (col.style.width = `${percents[index] ?? 0}%`));
}

function $fill(cell: TableCellNode, text: string) {
  cell.clear();
  cell.append($createParagraphNode().append(...(text ? [$createTextNode(text)] : [])));
}

// Spreadsheets put an HTML table on the clipboard, which Lexical pastes itself; plain tab-separated text (a terminal,
// a text editor, a CSV turned to TSV) becomes a table here, or fills the cells from the caret's one onwards.
function $paste_tsv(rows: string[][]): boolean {
  const selection = $getSelection();
  if (!$isRangeSelection(selection)) return false;
  const cell = $cell_of(selection.anchor.getNode());
  const table = $table_of(cell);
  if (!cell || !table) {
    const created = $createTableNodeWithDimensions(rows.length, rows[0].length, false);
    $insertNodeToNearestRoot(created);
    $grid(created).forEach((row, r) => row.forEach((value, c) => $fill(value.cell, rows[r][c])));
    $grid(created)[0][0].cell.selectEnd();
    return true;
  }
  const start = $getTableCellNodeRect(cell) ?? { rowIndex: 0, columnIndex: 0 };
  let map = $grid(table);
  while (map.length < start.rowIndex + rows.length) {
    const last = map[map.length - 1];
    $insertTableRowAtNode(last[last.length - 1].cell, true);
    map = $grid(table);
  }
  while (map[0].length < start.columnIndex + rows[0].length) {
    const last = map[0][map[0].length - 1].cell;
    $insertTableColumnAtNode(last, true);
    map = $grid(table);
  }
  rows.forEach((row, r) =>
    row.forEach((text, c) => {
      const value = map[start.rowIndex + r]?.[start.columnIndex + c];
      if (value && value.startRow === start.rowIndex + r && value.startColumn === start.columnIndex + c) $fill(value.cell, text);
    })
  );
  return true;
}

export function register_tables(editor: LexicalEditor): () => void {
  return mergeRegister(
    editor.registerMutationListener(
      TableNode,
      (mutations) =>
        editor.read(() => {
          for (const [key, mutation] of mutations) if (mutation !== "destroyed") paint(editor, key);
        }),
      { skipInitialization: false }
    ),
    // A table that ends the document keeps a paragraph after it, or there'd be nowhere to type below it.
    editor.registerNodeTransform(TableNode, (table) => {
      if ($isRootNode(table.getParent()) && !table.getNextSibling()) table.insertAfter($createParagraphNode());
    }),
    editor.registerCommand(
      PASTE_COMMAND,
      (event) => {
        if (!(event instanceof ClipboardEvent) || !event.clipboardData) return false;
        if (event.clipboardData.getData("text/html").includes("<table")) return false;
        const rows = parse_tsv(event.clipboardData.getData("text/plain"));
        if (!rows) return false;
        event.preventDefault();
        editor.update(() => void $paste_tsv(rows), { tag: "paste" });
        return true;
      },
      COMMAND_PRIORITY_LOW
    )
  );
}

export function insert_table(editor: LexicalEditor, rows: number, columns: number) {
  editor.dispatchCommand(INSERT_TABLE_COMMAND, { rows: String(rows), columns: String(columns), includeHeaders: false });
}

export const TableAction = {
  ROW_ABOVE: "row-above",
  ROW_BELOW: "row-below",
  COLUMN_LEFT: "column-left",
  COLUMN_RIGHT: "column-right",
  DELETE_ROW: "delete-row",
  DELETE_COLUMN: "delete-column",
  MERGE: "merge",
  SPLIT: "split",
  DELETE_TABLE: "delete-table",
} as const;
export type TableAction = (typeof TableAction)[keyof typeof TableAction];

export function table_action(editor: LexicalEditor, action: TableAction) {
  editor.update(() => {
    const selection = $getSelection();
    if (!$isRangeSelection(selection) && !$isTableSelection(selection)) return;
    const table = $table_of(selection.anchor.getNode());
    if (!table) return;
    if (action === TableAction.ROW_ABOVE || action === TableAction.ROW_BELOW) $insertTableRowAtSelection(action === TableAction.ROW_BELOW);
    else if (action === TableAction.COLUMN_LEFT || action === TableAction.COLUMN_RIGHT) $insertTableColumnAtSelection(action === TableAction.COLUMN_RIGHT);
    else if (action === TableAction.DELETE_ROW) $deleteTableRowAtSelection();
    else if (action === TableAction.DELETE_COLUMN) $deleteTableColumnAtSelection();
    else if (action === TableAction.MERGE && $isTableSelection(selection)) {
      $mergeCells(selection.getNodes().filter($isTableCellNode))?.selectEnd();
    } else if (action === TableAction.SPLIT) $unmergeCell();
    else if (action === TableAction.DELETE_TABLE) {
      const next = table.getNextSibling() ?? table.getPreviousSibling();
      table.remove();
      if ($getRoot().isEmpty()) $getRoot().append($createParagraphNode());
      if (next) next.selectStart();
      else $getRoot().selectStart();
    }
  });
}

export function set_table_header(editor: LexicalEditor, key: NodeKey, on: boolean) {
  editor.update(() => {
    const table = $getNodeByKey(key);
    if ($isTableNode(table) && table.getChildrenSize()) $setTableRowIsHeader(table, 0, on);
  });
}

export function set_table_borders(editor: LexicalEditor, key: NodeKey, on: boolean) {
  editor.update(() => {
    const table = $getNodeByKey(key);
    if ($isTableNode(table)) $setState(table, borders_state, on);
  });
}

export function set_table_widths(editor: LexicalEditor, key: NodeKey, widths: number[]) {
  editor.update(() => {
    const table = $getNodeByKey(key);
    if ($isTableNode(table)) table.setColWidths(widths);
  });
}

export function cell_at(editor: LexicalEditor, element: Element): { key: NodeKey; widths: number[]; column: number; columns: number } | null {
  return editor.read(() => {
    const cell = $cell_of($getNearestNodeFromDOMNode(element));
    const table = $table_of(cell);
    if (!cell || !table) return null;
    const columns = $grid(table)[0]?.length ?? 0;
    const rect = $getTableCellNodeRect(cell);
    if (!rect) return null;
    return { key: table.getKey(), widths: column_percents(table.getColWidths(), columns), column: rect.columnIndex + rect.colSpan - 1, columns };
  });
}

export function $in_table(): TableNode | null {
  const selection = $getSelection();
  return $isRangeSelection(selection) || $isTableSelection(selection) ? $table_of(selection.anchor.getNode()) : null;
}

