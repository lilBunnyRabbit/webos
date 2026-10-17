import kernel, { type AppsService, type FilesService } from "$lib/core/api";
import { join_path, split_path } from "$lib/core/api/services/files/path";
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
  type Column,
  type Folder,
  type KanbanFile,
} from "./data";
import { live_file, type LiveFile } from "$lib/core/contexts/app";
import { all_cards, first_open_column, resolve_board, resolve_card, resolve_column, resolve_note, type FoundCard } from "./lookup";
import { folder_board, NO_VALUE, pin_columns, type NoteCard } from "./folder";
import { create_note, FolderReader, write_card_field } from "./folder-store";
import { day_key, resolve_day } from "$lib/core/utils/date";

const boards: LiveFile<KanbanFile> = live_file(BOARDS_PATH, default_file(), KanbanFileSchema);

const files = () => kernel.service<FilesService>("files");

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
    path: board.folder ? join_path(split_path(board.folder.path), card.id) : null,
  };
}

function found<T>(result: T | string): T {
  if (typeof result === "string") throw new ShellError(result);
  return result;
}

function locate(file: KanbanFile, card_id: string): FoundCard {
  return found(resolve_card(file, card_id));
}

interface FolderView {
  notes: NoteCard[];
  shown: Board;
}

async function read_folder(stored: Board, folder: Folder): Promise<FolderView> {
  const notes = await new FolderReader(files).list(folder.path);
  if (!notes) throw new ShellError(`${stored.name}: ${folder.path} isn't there, or its folder is locked`);
  return { notes, shown: folder_board(stored, folder, notes) };
}

const folder_cards = (shown: Board): FoundCard[] =>
  shown.columns.flatMap((column) => column.cards.map((card) => ({ board: shown, column, card })));

function note_value(shown: Board, file: string, column?: Column): Tagged {
  const entry = folder_cards(shown).find(({ card }) => card.id === file);
  if (!entry) throw new ShellError(`${file} isn't on ${shown.name}`);
  return card_value({ ...entry, column: column ?? entry.column });
}

export function open_card(board: string, card: string): void {
  kernel.service<AppsService>("apps").launch(KANBAN_APP_ID, { board, card });
}

export function open_file(path: string): void {
  kernel.service<AppsService>("apps").launch("text-editor", { path });
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
  let cards = board?.folder
    ? folder_cards((await read_folder(board, board.folder)).shown)
    : all_cards(file).filter((entry) => !board || entry.board.id === board.id);
  if (args.due)
    cards = cards
      .filter(({ column, card }) => !column.done && card.due !== null)
      .sort((a, b) => a.card.due!.localeCompare(b.card.due!));
  for (const entry of cards) yield card_value(entry);
}

async function add_note(stored: Board, folder: Folder, title: string, column_query: string | undefined, due: string | null): Promise<Tagged> {
  const { shown } = await read_folder(stored, folder);
  const column = column_query ? found(resolve_column(shown, column_query)) : first_open_column(shown);
  if (!column) throw new ShellError(`board ${stored.name} has no columns`);
  const name = await create_note(files(), folder.path, { title, field: folder.field, value: column.id, template: folder.template });
  if (due) await write_card_field(files(), folder.path, name, "due", due);
  return note_value((await read_folder(stored, folder)).shown, name);
}

export async function add({
  args,
}: CommandContext<{ title: string[]; column?: string; due?: string; board?: string }>): Promise<Tagged> {
  const title = args.title.join(" ").trim();
  if (!title) throw new ShellError("kanban add: give the card a title");
  const due = args.due === undefined ? null : resolve_day(args.due, day_key());
  if (due === null && args.due !== undefined)
    throw new ShellError(`kanban add: "${args.due}" isn't a day; use YYYY-MM-DD`);

  const pick_board = (file: KanbanFile) => (args.board ? found(resolve_board(file, args.board)) : get_board(file, null));
  const target = pick_board(await boards.read());
  if (target.folder) return add_note(target, target.folder, title, args.column, due);

  const card = new_card(title);
  card.due = due;
  let placed: FoundCard | null = null;
  await boards.edit((file) => {
    const board = pick_board(file);
    const column = args.column ? found(resolve_column(board, args.column)) : first_open_column(board);
    if (!column) throw new ShellError(`board ${board.name} has no columns`);
    const next = update_board(file, board.id, (current) => add_card(current, column.id, card));
    placed = locate(next, card.id);
    return next;
  });
  return card_value(placed!);
}

async function move(query: string, pick: (board: Board) => string, only?: Board): Promise<Tagged> {
  let moved: FoundCard | null = null;
  await boards.edit((file) => {
    const scope = only ? { ...file, boards: file.boards.filter((board) => board.id === only.id) } : file;
    const { board, card } = locate(scope, query);
    const column = pick(board);
    const next = update_board(file, board.id, (current) => move_card(current, card.id, column, Infinity));
    moved = locate(next, card.id);
    return next;
  });
  return card_value(moved!);
}

async function move_note(stored: Board, folder: Folder, query: string, column_query: string): Promise<Tagged> {
  const { notes, shown } = await read_folder(stored, folder);
  const note = found(resolve_note(notes, query));
  const column = found(resolve_column(shown, column_query));
  if (shown.columns.some((other) => other.id !== NO_VALUE && !stored.columns.some((known) => known.id === other.id)))
    await boards.edit((file) => update_board(file, stored.id, (current) => pin_columns(current, shown)));
  await write_card_field(files(), folder.path, note.file, folder.field, column.id);
  return note_value(shown, note.file, column);
}

export async function mv({ args }: CommandContext<{ card: string; column: string; board?: string }>): Promise<Tagged> {
  const board = args.board ? found(resolve_board(await boards.read(), args.board)) : undefined;
  if (board?.folder) return move_note(board, board.folder, args.card, args.column);
  return move(args.card, (owner) => found(resolve_column(owner, args.column)).id, board);
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
