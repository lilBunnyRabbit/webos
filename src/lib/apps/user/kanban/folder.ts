import type { Board, Card, Column, Folder } from "./data";
import { field_text, note_title, parse_frontmatter, type FieldValue } from "./frontmatter";

export interface NoteCard {
  file: string;
  title: string;
  fields: Record<string, FieldValue>;
}

export interface CardField {
  key: string;
  text: string;
}

// Never stored: column ids in the file are non-empty, so it can't clash with a value.
export const NO_VALUE = "";

export function read_note(file: string, text: string): NoteCard {
  const { fields, body } = parse_frontmatter(text);
  return { file, title: note_title(fields, body, file), fields };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function note_card(note: NoteCard): Card {
  const due = field_text(note.fields, "due");
  return { id: note.file, title: note.title, notes: "", labels: [], due: DAY.test(due) ? due : null, checklist: [], created: "" };
}

export function folder_board(board: Board, folder: Folder, notes: NoteCard[]): Board {
  const columns = new Map<string, Column>(board.columns.map((column) => [column.id, { ...column, cards: [] }]));
  let missing: Column | null = null;
  for (const note of notes) {
    const value = field_text(note.fields, folder.field).trim();
    let column: Column | null | undefined = value === NO_VALUE ? missing : columns.get(value);
    if (!column) {
      column = { id: value, name: value || `No ${folder.field}`, wip: null, done: false, cards: [] };
      if (value === NO_VALUE) missing = column;
      else columns.set(value, column);
    }
    column.cards.push(note_card(note));
  }
  const ordered = [...columns.values(), ...(missing ? [missing] : [])];
  for (const column of ordered) column.cards.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: "base" }));
  return { ...board, columns: ordered };
}

// A column met only in the files gets stored the first time it's moved or flagged, so it keeps that place.
export function pin_columns(board: Board, shown: Board): Board {
  return { ...board, columns: shown.columns.filter((column) => column.id !== NO_VALUE).map((column) => ({ ...column, cards: [] })) };
}

export function order_columns(board: Board, values: string[]): Board {
  const known = new Map(board.columns.map((column) => [column.id, column]));
  const unique = [...new Set(values.map((value) => value.trim()).filter((value) => value !== NO_VALUE))];
  return {
    ...board,
    columns: unique.map((value) => ({ ...(known.get(value) ?? { id: value, name: value, wip: null, done: false }), cards: [] })),
  };
}

export const split_list = (text: string): string[] =>
  text
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item !== "");

const plain = (value: string) => value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target: string, alias?: string) => alias ?? target);

export function card_fields(note: NoteCard, show: string[]): CardField[] {
  return show.flatMap((key) => {
    const value = note.fields[key];
    const text = (Array.isArray(value) ? value.map(plain).join(", ") : plain(value ?? "")).trim();
    return text ? [{ key, text }] : [];
  });
}
