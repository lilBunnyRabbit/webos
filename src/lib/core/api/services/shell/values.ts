import { ShellError, type Tagged, type Value, type ValueType } from "./type";

export function is_record(value: Value | undefined): value is { [key: string]: Value } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function is_tagged(value: Value | undefined): value is Tagged {
  return is_record(value) && typeof value.$type === "string";
}

/** `a.b` digs into records; a tagged value's fields are plain fields. */
export function field_of(value: Value, path: string): Value | undefined {
  let current: Value | undefined = value;
  for (const key of path.split(".")) {
    if (Array.isArray(current) && /^\d+$/.test(key)) current = current[Number(key)];
    else if (is_record(current)) current = current[key];
    else return undefined;
  }
  return current;
}

/** Plain form of any value. Records are `key: value` lines; tagged values use their type's `text`. */
export function to_text(value: Value, types: (type: string) => ValueType | undefined): string {
  if (value === null) return "null";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return value.map((item) => to_text(item, types)).join("\n");
  if (is_tagged(value)) {
    const type = types(value.$type);
    if (type) return type.text(value);
  }
  return Object.entries(value)
    .filter(([key]) => key !== "$type")
    .map(([key, item]) => `${key}: ${typeof item === "object" && item !== null ? JSON.stringify(item) : to_text(item, types)}`)
    .join("\n");
}

const SIZES: Record<string, number> = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3, tb: 1024 ** 4 };
const DURATIONS: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/**
 * A literal typed on the command line. Sizes are bytes (`1mb`, 1024-based); durations are a moment that long ago
 * (`2d`), so `where modified > 2d` keeps the last two days.
 */
export function parse_literal(raw: string, now = Date.now()): Value {
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (raw === "null") return null;
  const unit = /^(-?\d+(?:\.\d+)?)([a-z]+)$/i.exec(raw);
  if (unit) {
    const amount = Number(unit[1]);
    const suffix = unit[2].toLowerCase();
    if (suffix in SIZES) return amount * SIZES[suffix];
    if (suffix in DURATIONS) return now - amount * DURATIONS[suffix];
  }
  if (raw.trim() !== "" && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

export const OPERATORS = ["==", "!=", ">", "<", ">=", "<=", "=~"] as const;
export type Operator = (typeof OPERATORS)[number];

export function is_operator(raw: string): raw is Operator {
  return (OPERATORS as readonly string[]).includes(raw);
}

/** `=~` is a case-insensitive contains on the text form; the others compare numbers as numbers, the rest as text. */
export function compare(left: Value | undefined, operator: Operator, right: Value): boolean {
  if (left === undefined) return operator === "!=";
  if (operator === "=~") return String(left).toLowerCase().includes(String(right).toLowerCase());
  if (operator === "==") return loose(left) === loose(right);
  if (operator === "!=") return loose(left) !== loose(right);
  // A folder's size is null: "bigger than 1mb" is a question about numbers, so non-numbers never pass it.
  if ((typeof left === "number") !== (typeof right === "number")) return false;
  const order = typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
  if (operator === ">") return order > 0;
  if (operator === "<") return order < 0;
  if (operator === ">=") return order >= 0;
  return order <= 0;
}

/** Typed literals arrive parsed (`10`, `true`), fields may hold text: equality compares the text forms. */
function loose(value: Value): string {
  return typeof value === "object" && value !== null ? JSON.stringify(value) : String(value);
}

/** Sort key: numbers first by value, then text. */
export function order_values(a: Value | undefined, b: Value | undefined): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : 1;
  if (b === undefined || b === null) return -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function require_operator(raw: string | undefined): Operator {
  if (raw && is_operator(raw)) return raw;
  throw new ShellError(`where: expected one of ${OPERATORS.join(" ")}, got "${raw ?? ""}"`);
}
