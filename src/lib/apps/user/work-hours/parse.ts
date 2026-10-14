import { shift_month } from "./data";

const NAMED: Record<string, number> = { "": 0, this: 0, last: -1, prev: -1, next: 1 };

/** `this`, `last` / `prev`, `next`, `+N` / `-N` months, `YYYY-MM`, or `M` (this year); `null` otherwise. */
export function parse_month(text: string, current: string): string | null {
  const value = text.trim().toLowerCase();
  if (value in NAMED) return shift_month(current, NAMED[value]);
  if (/^[+-]\d{1,3}$/.test(value)) return shift_month(current, Number(value));
  let match = /^(\d{4})-(\d{1,2})$/.exec(value);
  if (!match) match = /^()(\d{1,2})$/.exec(value);
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1] || current.slice(0, 4)}-${String(month).padStart(2, "0")}`;
}
