export interface Span {
  col_span: number;
  row_span: number;
}

export interface GridItem<T extends Span> {
  cell: T;
  column: number;
  continued: boolean;
}

/**
 * Lays rows of cells out on the grid, as HTML and Lexical store them: a row holds only the cells that start in it,
 * and a cell spanning rows takes its columns in the rows below. Word wants those positions written out (`w:vMerge`).
 */
export function grid_rows<T extends Span>(rows: T[][]): { rows: GridItem<T>[][]; columns: number } {
  const carried = new Map<number, { cell: T; left: number }>();
  let columns = 0;
  const out = rows.map((cells) => {
    const items: GridItem<T>[] = [];
    let column = 0;
    let next = 0;
    for (;;) {
      const above = carried.get(column);
      if (above) {
        items.push({ cell: above.cell, column, continued: true });
        if (--above.left === 0) carried.delete(column);
        column += Math.max(1, above.cell.col_span);
      } else if (next < cells.length) {
        const cell = cells[next++];
        items.push({ cell, column, continued: false });
        if (cell.row_span > 1) carried.set(column, { cell, left: cell.row_span - 1 });
        column += Math.max(1, cell.col_span);
      } else {
        const later = [...carried.keys()].filter((key) => key > column);
        if (!later.length) break;
        column = Math.min(...later);
      }
    }
    columns = Math.max(columns, column);
    return items;
  });
  return { rows: out, columns };
}

// Stored widths are weights, not lengths: the column on screen shrinks with the window and differs from the printed one.
export function column_percents(widths: readonly number[] | undefined, columns: number): number[] {
  if (columns < 1) return [];
  if (!widths || widths.length !== columns || !widths.every((width) => Number.isFinite(width) && width > 0)) {
    return Array.from({ length: columns }, () => 100 / columns);
  }
  const total = widths.reduce((sum, width) => sum + width, 0);
  return widths.map((width) => (width / total) * 100);
}

export const MIN_COLUMN = 5;

const round = (value: number) => Math.round(value * 100) / 100;

export function with_column_width(widths: readonly number[], index: number, percent: number): number[] {
  const count = widths.length;
  if (count < 2 || index < 0 || index >= count) return [...widths];
  const target = Math.min(100 - MIN_COLUMN * (count - 1), Math.max(MIN_COLUMN, percent));
  const others = widths.reduce((sum, width, at) => (at === index ? sum : sum + width), 0);
  return widths.map((width, at) => round(at === index ? target : others > 0 ? (width / others) * (100 - target) : (100 - target) / (count - 1)));
}

export function move_border(widths: readonly number[], index: number, delta: number): number[] {
  if (index < 0 || index >= widths.length - 1) return [...widths];
  const pair = widths[index] + widths[index + 1];
  const left = Math.min(pair - MIN_COLUMN, Math.max(MIN_COLUMN, widths[index] + delta));
  return widths.map((width, at) => round(at === index ? left : at === index + 1 ? pair - left : width));
}

export const WIDTH_PRESETS = [25, 33, 50, 67, 75] as const;

export const TABLE_PICKER = { rows: 8, columns: 8 } as const;

export function parse_tsv(text: string): string[][] | null {
  if (!text.includes("\t")) return null;
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  if (lines.length > 500) return null;
  const rows = lines.map((line) => line.split("\t"));
  const columns = Math.max(...rows.map((row) => row.length));
  if (columns < 2 || columns > 50) return null;
  return rows.map((row) => [...row, ...Array.from({ length: columns - row.length }, () => "")]);
}
