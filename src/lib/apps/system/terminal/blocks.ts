import type { Tagged, Value, ValueType } from "$lib/core/api";
import { is_record, is_tagged, to_text } from "$lib/core/api/services/shell/values";

/** How a run of output values renders: text, one record as key/value lines, or a table. */
export type Block =
  | { kind: "text"; text: string }
  | { kind: "record"; value: { [key: string]: Value } }
  | { kind: "table"; type: string | null; columns: string[]; rows: { [key: string]: Value }[] };

type Types = (type: string) => ValueType | undefined;

/**
 * Groups consecutive values: tagged values of one known type become a table with the type's columns; plain records
 * with the same keys become a table, a lone one a record; everything else is text, consecutive lines joined.
 */
export function to_blocks(values: Value[], types: Types): Block[] {
  const blocks: Block[] = [];

  for (const value of values) {
    const last = blocks.at(-1);
    const type = is_tagged(value) ? types(value.$type) : undefined;

    if (is_tagged(value) && type) {
      if (last?.kind === "table" && last.type === value.$type) last.rows.push(value);
      else blocks.push({ kind: "table", type: value.$type, columns: type.columns, rows: [value] });
      continue;
    }

    if (is_record(value)) {
      const columns = Object.keys(value).filter((key) => key !== "$type");
      if (last?.kind === "table" && last.type === null && same(last.columns, columns)) last.rows.push(value);
      else if (last?.kind === "record" && same(keys(last.value), columns)) blocks[blocks.length - 1] = { kind: "table", type: null, columns, rows: [last.value, value] };
      else blocks.push({ kind: "record", value });
      continue;
    }

    const text = Array.isArray(value) ? to_text(value, types) : value === null ? "null" : String(value);
    if (last?.kind === "text") last.text += `\n${text}`;
    else blocks.push({ kind: "text", text });
  }

  return blocks;
}

function keys(record: { [key: string]: Value }): string[] {
  return Object.keys(record).filter((key) => key !== "$type");
}

function same(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** One table cell: the type's own formatting, else the plain form. */
export function cell(row: { [key: string]: Value }, column: string, type: ValueType | undefined): string {
  if (type?.cell) return type.cell(row as Tagged, column);
  const value = row[column];
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** Saved scrollback is text; past this an entry keeps its head. */
const SAVED_TEXT_LIMIT = 20_000;

export function saved_text(values: Value[], types: Types): string {
  const text = values.map((value) => to_text(value, types)).join("\n");
  return text.length > SAVED_TEXT_LIMIT ? `${text.slice(0, SAVED_TEXT_LIMIT)}\n…` : text;
}
