import type { Board, Card, Column, KanbanFile } from "./data";

export interface FoundCard {
  board: Board;
  column: Column;
  card: Card;
}

export function all_cards(file: KanbanFile): FoundCard[] {
  return file.boards.flatMap((board) => board.columns.flatMap((column) => column.cards.map((card) => ({ board, column, card }))));
}

function pick<T>(items: T[], query: string, what: string, tests: ((item: T, query: string) => boolean)[], label: (item: T) => string): T | string {
  const q = query.trim().toLowerCase();
  if (!q) return `no ${what} given`;
  for (const test of tests) {
    const found = items.filter((item) => test(item, q));
    if (found.length === 1) return found[0];
    if (found.length > 1) {
      const names = found.slice(0, 5).map(label).join(", ");
      return `"${query}" matches ${found.length} ${what}s: ${names}${found.length > 5 ? ", …" : ""}`;
    }
  }
  return `no ${what} "${query}"`;
}

/** By id, id prefix, exact title, then a title containing the query, case-insensitive. A string is the error. */
export function resolve_card(file: KanbanFile, query: string): FoundCard | string {
  return pick(
    all_cards(file),
    query,
    "card",
    [
      ({ card }, q) => card.id === q,
      ({ card }, q) => card.id.startsWith(q),
      ({ card }, q) => card.title.trim().toLowerCase() === q,
      ({ card }, q) => card.title.toLowerCase().includes(q),
    ],
    ({ card }) => `${card.id} ${card.title}`
  );
}

const named = <T extends { id: string; name: string }>(): ((item: T, q: string) => boolean)[] => [
  (item, q) => item.id === q,
  (item, q) => item.name.trim().toLowerCase() === q,
  (item, q) => item.name.toLowerCase().startsWith(q),
];

export function resolve_column(board: Board, query: string): Column | string {
  return pick(board.columns, query, "column", named<Column>(), (column) => column.name);
}

export function resolve_board(file: KanbanFile, query: string): Board | string {
  return pick(file.boards, query, "board", named<Board>(), (board) => board.name);
}

export function first_open_column(board: Board): Column | null {
  return board.columns.find((column) => !column.done) ?? board.columns[0] ?? null;
}
