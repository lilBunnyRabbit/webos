import { pad2 } from "./utils";

/** Local calendar day, `YYYY-MM-DD`. */
export function day_key(date = new Date()): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function days_in(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function shift(day: string, by: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, date + by));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function valid(year: number, month: number, date: number): string | null {
  if (month < 1 || month > 12 || date < 1 || date > days_in(year, month)) return null;
  return `${year}-${pad2(month)}-${pad2(date)}`;
}

const NAMED: Record<string, number> = { today: 0, yesterday: -1, tomorrow: 1 };

/**
 * A typed day relative to `today`: `today`, `yesterday`, `tomorrow`, `+N` / `-N` days, `YYYY-MM-DD`, `MM-DD` (this
 * year) or `D` (this month). `null` when it isn't a real day.
 */
export function resolve_day(text: string, today: string): string | null {
  const value = text.trim().toLowerCase();
  if (value in NAMED) return shift(today, NAMED[value]);
  if (/^[+-]\d{1,4}$/.test(value)) return shift(today, Number(value));
  const [year, month] = today.split("-").map(Number);
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) return valid(Number(match[1]), Number(match[2]), Number(match[3]));
  match = /^(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) return valid(year, Number(match[1]), Number(match[2]));
  match = /^(\d{1,2})$/.exec(value);
  if (match) return valid(year, month, Number(match[1]));
  return null;
}

/** `9`, `09`, `9:30`, `09:30` or `24:00` to `HH:MM`; `null` otherwise. */
export function parse_time(text: string): string | null {
  const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  if (minutes > 59 || hours > 24 || (hours === 24 && minutes > 0)) return null;
  return `${pad2(hours)}:${pad2(minutes)}`;
}
