import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type CommandContext, type Tagged } from "$lib/core/api/services/shell/type";
import {
  add_card,
  archive_card,
  archive_done,
  BOARDS_PATH,
  default_file,
  done_count,
  get_board,
  KanbanFileSchema,
  KANBAN_APP_ID,
  move_card,
  new_card,
  update_board,
  type Board,
  type KanbanFile,
} from "./data";
import { live_file, type LiveFile } from "$lib/core/contexts/app";
import { all_cards, first_open_column, resolve_board, resolve_card, resolve_column, type FoundCard } from "./lookup";
import { day_key, resolve_day } from "$lib/core/utils/date";

const boards: LiveFile<KanbanFile> = live_file(BOARDS_PATH, default_file(), KanbanFileSchema);

export function card_value({ board, column, card }: FoundCard): Tagged {
  const labels = card.labels
    .map((id) => board.labels.find((label) => label.id === id)?.name)
    .filter((name) => name !== undefined);
  return {
    $type: "card",
    id: card.id,
    board: board.name,
    board_id: board.id,
    column: column.name,
    title: card.title,
    due: card.due,
    labels: labels.join(", "),
  };
}

function found<T>(result: T | string): T {
  if (typeof result === "string") throw new ShellError(result);
  return result;
}

function locate(file: KanbanFile, card_id: string): FoundCard {
  return found(resolve_card(file, card_id));
}

export function open_card(board: string, card: string): void {
  kernel.service<AppsService>("apps").launch(KANBAN_APP_ID, { board, card });
}

export async function open_app(query?: string): Promise<void> {
  if (!query) {
    kernel.service<AppsService>("apps").launch(KANBAN_APP_ID);
    return;
  }
  const { board, card } = locate(await boards.read(), query);
  open_card(board.id, card.id);
}

export async function* list({ args }: CommandContext<{ board?: string; due: boolean }>): AsyncGenerator<Tagged> {
  const file = await boards.read();
  const board = args.board ? found(resolve_board(file, args.board)) : null;
  let cards = all_cards(file).filter((entry) => !board || entry.board.id === board.id);
  if (args.due)
    cards = cards
      .filter(({ column, card }) => !column.done && card.due !== null)
      .sort((a, b) => a.card.due!.localeCompare(b.card.due!));
  for (const entry of cards) yield card_value(entry);
}

export async function add({
  args,
}: CommandContext<{ title: string[]; column?: string; due?: string; board?: string }>): Promise<Tagged> {
  const title = args.title.join(" ").trim();
  if (!title) throw new ShellError("kanban add: give the card a title");
  const due = args.due === undefined ? null : resolve_day(args.due, day_key());
  if (due === null && args.due !== undefined)
    throw new ShellError(`kanban add: "${args.due}" isn't a day; use YYYY-MM-DD`);

  const card = new_card(title);
  card.due = due;
  let placed: FoundCard | null = null;
  await boards.edit((file) => {
    const board = args.board ? found(resolve_board(file, args.board)) : get_board(file, null);
    if (board.folder) throw new ShellError(`${board.name} is a folder board: its cards are the files in ${board.folder.path}`);
    const column = args.column ? found(resolve_column(board, args.column)) : first_open_column(board);
    if (!column) throw new ShellError(`board ${board.name} has no columns`);
    const next = update_board(file, board.id, (current) => add_card(current, column.id, card));
    placed = locate(next, card.id);
    return next;
  });
  return card_value(placed!);
}

async function move(query: string, pick: (board: Board) => string): Promise<Tagged> {
  let moved: FoundCard | null = null;
  await boards.edit((file) => {
    const { board, card } = locate(file, query);
    const column = pick(board);
    const next = update_board(file, board.id, (current) => move_card(current, card.id, column, Infinity));
    moved = locate(next, card.id);
    return next;
  });
  return card_value(moved!);
}

export function mv({ args }: CommandContext<{ card: string; column: string }>): Promise<Tagged> {
  return move(args.card, (board) => found(resolve_column(board, args.column)).id);
}

export function done({ args }: CommandContext<{ card: string }>): Promise<Tagged> {
  return move(args.card, (board) => {
    const column = board.columns.find((candidate) => candidate.done);
    if (!column) throw new ShellError(`board ${board.name} has no done column`);
    return column.id;
  });
}

export async function archive({ args }: CommandContext<{ card?: string }>): Promise<string> {
  let message = "";
  await boards.edit((file) => {
    if (args.card) {
      const { board, card } = locate(file, args.card);
      message = `archived ${card.title}`;
      return update_board(file, board.id, (current) => archive_card(current, card.id));
    }
    const count = file.boards.reduce((sum, board) => sum + done_count(board), 0);
    message = count ? `archived ${count} done ${count === 1 ? "card" : "cards"}` : "no done cards to archive";
    return count ? { ...file, boards: file.boards.map((board) => archive_done(board)) } : file;
  });
  return message;
}

export async function complete_cards(partial: string) {
  const query = partial.toLowerCase();
  return all_cards(await boards.read())
    .filter(({ card }) => card.id.startsWith(query) || card.title.toLowerCase().includes(query))
    .map(({ card, column }) => ({ value: card.id, detail: `${card.title} · ${column.name}` }));
}

export async function complete_names(field: string, partial: string) {
  const file = await boards.read();
  const names =
    field === "board"
      ? file.boards.map((board) => board.name)
      : file.boards.flatMap((board) => board.columns.map((column) => column.name));
  return [...new Set(names)]
    .filter((name) => name.toLowerCase().startsWith(partial.toLowerCase()))
    .map((value) => ({ value }));
}
