import { z } from "zod";
import type { Operations, Preset } from "../../engine/definition";
import { InputError, InputKind, random_int, type InputSpec } from "../../engine/inputs";

export const KeyOpKind = { INSERT: "insert", DELETE: "delete", FIND: "find" } as const;
export type KeyOpKind = (typeof KeyOpKind)[keyof typeof KeyOpKind];

export interface KeyOp {
  op: KeyOpKind;
  key: number;
}

const KEY_OP = z.object({ op: z.enum(KeyOpKind), key: z.number().int() });

const PREFIX: Record<KeyOpKind, string> = { insert: "", delete: "del ", find: "find " };

export function format_key_ops(ops: KeyOp[]): string {
  return ops.map((item) => `${PREFIX[item.op]}${item.key}`).join(", ");
}

export function key_ops(options: { sample: KeyOp[]; allow: KeyOpKind[]; max_count?: number; max_key?: number }): InputSpec<KeyOp[]> {
  const max_count = options.max_count ?? 40;
  const max_key = options.max_key ?? 999;
  const check = (ops: KeyOp[]) => {
    if (ops.length === 0) throw new InputError("Give at least one key.");
    if (ops.length > max_count) throw new InputError(`At most ${max_count} operations here.`);
    for (const item of ops) {
      if (!options.allow.includes(item.op)) throw new InputError(`This tree doesn't do ${item.op} here.`);
      if (!Number.isInteger(item.key) || item.key < 0 || item.key > max_key) throw new InputError(`Keys are whole numbers from 0 to ${max_key}.`);
    }
    return ops;
  };
  const words = options.allow.filter((op) => op !== KeyOpKind.INSERT).map((op) => `${PREFIX[op].trim()} 3`);
  return {
    kind: InputKind.TEXT,
    hint: `Keys to insert, comma separated${words.length ? `; also ${words.join(", ")}` : ""}`,
    schema: z.array(KEY_OP).max(max_count),
    parse: (text) =>
      check(
        text
          .split(",")
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean)
          .map((part) => {
            const match = /^(?:(del|delete|find|search)\s+)?(-?\d+)$/.exec(part);
            if (!match) throw new InputError(`Can't read “${part}”: write a key, or del 3, find 3.`);
            const op = !match[1] ? KeyOpKind.INSERT : match[1].startsWith("del") ? KeyOpKind.DELETE : KeyOpKind.FIND;
            return { op, key: Number(match[2]) };
          })
      ),
    format: format_key_ops,
    random: () => {
      const keys = new Set<number>();
      while (keys.size < 10) keys.add(random_int(1, 99));
      return [...keys].map((key) => ({ op: KeyOpKind.INSERT, key }));
    },
    sample: options.sample,
  };
}

export function key_operations(allow: KeyOpKind[], max_key = 999): Operations<KeyOp[]> {
  const labels: Record<KeyOpKind, string> = { insert: "Insert", delete: "Delete", find: "Find" };
  return {
    list: allow.map((op) => ({ id: op, label: labels[op], placeholder: "key" })),
    apply: (input, operation, value) => {
      const key = Number(value);
      if (!Number.isInteger(key) || key < 0 || key > max_key) throw new InputError(`A whole number from 0 to ${max_key}.`);
      return [...input, { op: operation as KeyOpKind, key }];
    },
  };
}

export const inserts = (...keys: number[]): KeyOp[] => keys.map((key) => ({ op: KeyOpKind.INSERT, key }));

export function key_presets(extra: Preset<KeyOp[]>[] = []): Preset<KeyOp[]>[] {
  return [
    { label: "Ascending keys", value: inserts(10, 20, 30, 40, 50, 60, 70) },
    { label: "Balanced order", value: inserts(40, 20, 60, 10, 30, 50, 70) },
    { label: "Zig-zag", value: inserts(50, 10, 40, 20, 30) },
    ...extra,
  ];
}

export const op_text = (item: KeyOp) => (item.op === KeyOpKind.INSERT ? `Insert ${item.key}` : item.op === KeyOpKind.DELETE ? `Delete ${item.key}` : `Find ${item.key}`);

export function priority_of(key: number): number {
  let h = (key + 0x9e3779b9) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) % 100;
}
