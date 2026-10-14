import { z } from "zod";

/**
 * Kanban's data file, `/var/lib/apps/kanban/boards.json`. A contract: Calendar reads due dates from it (ADR-035), so
 * a breaking change bumps `version` and keeps a reader for the old one.
 */
export const KANBAN_APP_ID = "kanban";
export const BOARDS_FILE = "boards.json";
export const BOARDS_PATH = `/var/lib/apps/${KANBAN_APP_ID}/${BOARDS_FILE}`;
export const KANBAN_VERSION = 1;

export const LabelColor = {
  PRIMARY: "primary",
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  ERROR: "error",
  ACCENT: "accent",
} as const;
export type LabelColor = (typeof LabelColor)[keyof typeof LabelColor];
export const LABEL_COLORS = Object.values(LabelColor);

const Id = z.string().min(1);
const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ChecklistItemSchema = z.object({ id: Id, text: z.string(), done: z.boolean() });

export const CardSchema = z.object({
  id: Id,
  title: z.string(),
  /** Plain text with a little markdown: `#` headings, `-` lists, `**bold**`, `*italic*`, `` `code` ``, links. */
  notes: z.string().default(""),
  labels: z.array(Id).default([]),
  due: Day.nullable().default(null),
  checklist: z.array(ChecklistItemSchema).default([]),
  created: z.string(),
});

export const ColumnSchema = z.object({
  id: Id,
  name: z.string(),
  /** Work-in-progress limit: more cards than this shows a warning, nothing is refused. */
  wip: z.number().int().positive().nullable().default(null),
  /** Cards here count as finished: no due warnings, and "Archive done cards" takes them. */
  done: z.boolean().default(false),
  cards: z.array(CardSchema),
});

export const LabelSchema = z.object({ id: Id, name: z.string(), color: z.enum(LabelColor) });

export const ArchivedCardSchema = CardSchema.extend({
  /** The column it was archived from; restoring puts it back there when the column still exists. */
  column: Id,
  archived: z.string(),
});

export const BoardSchema = z.object({
  id: Id,
  name: z.string(),
  labels: z.array(LabelSchema).default([]),
  columns: z.array(ColumnSchema),
  archive: z.array(ArchivedCardSchema).default([]),
});

export const KanbanFileSchema = z.object({
  version: z.literal(KANBAN_VERSION),
  boards: z.array(BoardSchema).min(1),
});

export type ChecklistItem = z.infer<typeof ChecklistItemSchema>;
export type Card = z.infer<typeof CardSchema>;
export type Column = z.infer<typeof ColumnSchema>;
export type Label = z.infer<typeof LabelSchema>;
export type ArchivedCard = z.infer<typeof ArchivedCardSchema>;
export type Board = z.infer<typeof BoardSchema>;
export type KanbanFile = z.infer<typeof KanbanFileSchema>;

export const new_id = (): string => crypto.randomUUID().slice(0, 8);

// Fixed ids, so every reader that starts from the default before the file exists agrees on it.
const DEFAULT_BOARD: Board = {
  id: "life",
  name: "Life",
  labels: [
    { id: "errand", name: "Errand", color: LabelColor.INFO },
    { id: "home", name: "Home", color: LabelColor.SUCCESS },
    { id: "health", name: "Health", color: LabelColor.ERROR },
    { id: "project", name: "Project", color: LabelColor.PRIMARY },
    { id: "idea", name: "Idea", color: LabelColor.ACCENT },
  ],
  columns: [
    { id: "later", name: "Later", wip: null, done: false, cards: [] },
    { id: "next", name: "Next", wip: null, done: false, cards: [] },
    { id: "doing", name: "Doing", wip: 3, done: false, cards: [] },
    { id: "done", name: "Done", wip: null, done: true, cards: [] },
  ],
  archive: [],
};

export function default_file(): KanbanFile {
  return { version: KANBAN_VERSION, boards: [structuredClone(DEFAULT_BOARD)] };
}

export function new_board(name: string): Board {
  const board = structuredClone(DEFAULT_BOARD);
  const labels = board.labels.map((label) => ({ ...label, id: new_id() }));
  return {
    ...board,
    id: new_id(),
    name,
    labels,
    columns: board.columns.map((column) => ({ ...column, id: new_id() })),
  };
}

export function new_card(title: string, now = new Date()): Card {
  return { id: new_id(), title, notes: "", labels: [], due: null, checklist: [], created: now.toISOString() };
}

export function get_board(file: KanbanFile, id: string | null | undefined): Board {
  return file.boards.find((board) => board.id === id) ?? file.boards[0];
}

export function update_board(file: KanbanFile, id: string, update: (board: Board) => Board): KanbanFile {
  return { ...file, boards: file.boards.map((board) => (board.id === id ? update(board) : board)) };
}

export function add_board(file: KanbanFile, board: Board): KanbanFile {
  return { ...file, boards: [...file.boards, board] };
}

export function rename_board(file: KanbanFile, id: string, name: string): KanbanFile {
  return update_board(file, id, (board) => ({ ...board, name }));
}

export function remove_board(file: KanbanFile, id: string): KanbanFile {
  if (file.boards.length <= 1) return file;
  return { ...file, boards: file.boards.filter((board) => board.id !== id) };
}

const map_column = (board: Board, id: string, update: (column: Column) => Column): Board => ({
  ...board,
  columns: board.columns.map((column) => (column.id === id ? update(column) : column)),
});

export function add_column(board: Board, name: string, id = new_id()): Board {
  return { ...board, columns: [...board.columns, { id, name, wip: null, done: false, cards: [] }] };
}

export function rename_column(board: Board, id: string, name: string): Board {
  return map_column(board, id, (column) => ({ ...column, name }));
}

export function set_wip(board: Board, id: string, wip: number | null): Board {
  const limit = wip !== null && Number.isFinite(wip) && wip >= 1 ? Math.floor(wip) : null;
  return map_column(board, id, (column) => ({ ...column, wip: limit }));
}

export function set_done_column(board: Board, id: string, done: boolean): Board {
  return map_column(board, id, (column) => ({ ...column, done }));
}

export function move_column(board: Board, id: string, index: number): Board {
  const from = board.columns.findIndex((column) => column.id === id);
  if (from < 0) return board;
  const rest = board.columns.filter((column) => column.id !== id);
  const to = Math.max(0, Math.min(index, rest.length));
  return { ...board, columns: [...rest.slice(0, to), board.columns[from], ...rest.slice(to)] };
}

/** Deletes the column with its cards. Cards archived from it restore to the first column. */
export function remove_column(board: Board, id: string): Board {
  return { ...board, columns: board.columns.filter((column) => column.id !== id) };
}

export function is_over_wip(column: Column): boolean {
  return column.wip !== null && column.cards.length > column.wip;
}

export interface CardLocation {
  card: Card;
  column: Column;
  index: number;
}

export function find_card(board: Board, id: string): CardLocation | null {
  for (const column of board.columns) {
    const index = column.cards.findIndex((card) => card.id === id);
    if (index >= 0) return { card: column.cards[index], column, index };
  }
  return null;
}

export function add_card(board: Board, column_id: string, card: Card, index?: number): Board {
  return map_column(board, column_id, (column) => {
    const at = index === undefined ? column.cards.length : Math.max(0, Math.min(index, column.cards.length));
    return { ...column, cards: [...column.cards.slice(0, at), card, ...column.cards.slice(at)] };
  });
}

export function update_card(board: Board, id: string, update: (card: Card) => Card): Board {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.cards.some((card) => card.id === id)
        ? { ...column, cards: column.cards.map((card) => (card.id === id ? update(card) : card)) }
        : column
    ),
  };
}

export function remove_card(board: Board, id: string): Board {
  return {
    ...board,
    columns: board.columns.map((column) =>
      column.cards.some((card) => card.id === id) ? { ...column, cards: column.cards.filter((card) => card.id !== id) } : column
    ),
  };
}

export function move_card(board: Board, id: string, column_id: string, index: number): Board {
  const found = find_card(board, id);
  if (!found || !board.columns.some((column) => column.id === column_id)) return board;
  return add_card(remove_card(board, id), column_id, found.card, index);
}

/**
 * The index a card lands at when dropped before `before_id` in `column` (`null`: the end). Counted without the moved
 * card, the way `move_card` counts.
 */
export function index_before(column: Column, before_id: string | null, moving_id: string): number {
  const rest = column.cards.filter((card) => card.id !== moving_id);
  const index = before_id === null ? -1 : rest.findIndex((card) => card.id === before_id);
  return index < 0 ? rest.length : index;
}

export function column_index_before(board: Board, before_id: string | null, moving_id: string): number {
  const rest = board.columns.filter((column) => column.id !== moving_id);
  const index = before_id === null ? -1 : rest.findIndex((column) => column.id === before_id);
  return index < 0 ? rest.length : index;
}

export function archive_card(board: Board, id: string, now = new Date()): Board {
  const found = find_card(board, id);
  if (!found) return board;
  const archived: ArchivedCard = { ...found.card, column: found.column.id, archived: now.toISOString() };
  return { ...remove_card(board, id), archive: [archived, ...board.archive] };
}

export function archive_done(board: Board, now = new Date()): Board {
  const archived: ArchivedCard[] = board.columns
    .filter((column) => column.done)
    .flatMap((column) => column.cards.map((card) => ({ ...card, column: column.id, archived: now.toISOString() })));
  if (archived.length === 0) return board;
  return {
    ...board,
    columns: board.columns.map((column) => (column.done ? { ...column, cards: [] } : column)),
    archive: [...archived, ...board.archive],
  };
}

export function done_count(board: Board): number {
  return board.columns.filter((column) => column.done).reduce((sum, column) => sum + column.cards.length, 0);
}

/** Back to the top of its column, or of the first column when that one is gone. */
export function restore_card(board: Board, id: string): Board {
  const archived = board.archive.find((card) => card.id === id);
  if (!archived || board.columns.length === 0) return board;
  const { column, archived: _, ...card } = archived;
  const target = board.columns.some((candidate) => candidate.id === column) ? column : board.columns[0].id;
  return add_card({ ...board, archive: board.archive.filter((other) => other.id !== id) }, target, card, 0);
}

export function delete_archived(board: Board, id: string | null): Board {
  return { ...board, archive: id === null ? [] : board.archive.filter((card) => card.id !== id) };
}

export function add_check(card: Card, text: string): Card {
  return { ...card, checklist: [...card.checklist, { id: new_id(), text, done: false }] };
}

export function update_check(card: Card, id: string, patch: Partial<Omit<ChecklistItem, "id">>): Card {
  return { ...card, checklist: card.checklist.map((item) => (item.id === id ? { ...item, ...patch } : item)) };
}

export function remove_check(card: Card, id: string): Card {
  return { ...card, checklist: card.checklist.filter((item) => item.id !== id) };
}

export function checklist_progress(card: Card): { done: number; total: number } {
  return { done: card.checklist.filter((item) => item.done).length, total: card.checklist.length };
}

export function add_label(board: Board, name: string, id = new_id()): Board {
  const used = new Set(board.labels.map((label) => label.color));
  const color = LABEL_COLORS.find((candidate) => !used.has(candidate)) ?? LABEL_COLORS[board.labels.length % LABEL_COLORS.length];
  return { ...board, labels: [...board.labels, { id, name, color }] };
}

export function update_label(board: Board, id: string, patch: Partial<Omit<Label, "id">>): Board {
  return { ...board, labels: board.labels.map((label) => (label.id === id ? { ...label, ...patch } : label)) };
}

export function remove_label(board: Board, id: string): Board {
  const strip = <T extends Card>(card: T): T =>
    card.labels.includes(id) ? { ...card, labels: card.labels.filter((label) => label !== id) } : card;
  return {
    ...board,
    labels: board.labels.filter((label) => label.id !== id),
    columns: board.columns.map((column) => ({ ...column, cards: column.cards.map(strip) })),
    archive: board.archive.map(strip),
  };
}

export function toggle_label(card: Card, id: string): Card {
  return { ...card, labels: card.labels.includes(id) ? card.labels.filter((label) => label !== id) : [...card.labels, id] };
}

export const DueState = { OVERDUE: "overdue", TODAY: "today", SOON: "soon", LATER: "later" } as const;
export type DueState = (typeof DueState)[keyof typeof DueState];

export function days_between(today: string, day: string): number {
  const utc = (value: string) => {
    const [year, month, date] = value.split("-").map(Number);
    return Date.UTC(year, month - 1, date);
  };
  return Math.round((utc(day) - utc(today)) / 86_400_000);
}

export function due_state(due: string, today: string): DueState {
  const days = days_between(today, due);
  if (days < 0) return DueState.OVERDUE;
  if (days === 0) return DueState.TODAY;
  if (days <= 2) return DueState.SOON;
  return DueState.LATER;
}

export function is_due(card: Card, today: string): boolean {
  return card.due !== null && card.due <= today;
}

export interface DueCard {
  board: Board;
  column: Column;
  card: Card;
}

/**
 * Every card with a due date, across boards, sorted by day. Archived cards are left out; cards in done columns are
 * included, with `column.done` telling them apart. This is what Calendar reads.
 */
export function due_cards(file: KanbanFile): DueCard[] {
  return file.boards
    .flatMap((board) =>
      board.columns.flatMap((column) => column.cards.filter((card) => card.due !== null).map((card) => ({ board, column, card })))
    )
    .sort((a, b) => a.card.due!.localeCompare(b.card.due!));
}

export function count_due(file: KanbanFile, today: string): number {
  return due_cards(file).filter(({ column, card }) => !column.done && is_due(card, today)).length;
}
