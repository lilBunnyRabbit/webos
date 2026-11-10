import { Unit } from "./model";

export const MM_PER: Record<Unit, number> = { [Unit.MM]: 1, [Unit.CM]: 10, [Unit.M]: 1000 };
const DECIMALS: Record<Unit, number> = { [Unit.MM]: 1, [Unit.CM]: 1, [Unit.M]: 3 };

export const UNIT_LABELS: Record<Unit, string> = {
  [Unit.MM]: "Millimetres",
  [Unit.CM]: "Centimetres",
  [Unit.M]: "Metres",
};

export const MAX_INPUT = 9;

export const NumpadKey = { BACK: "back", POINT: "." } as const;

export function to_mm(value: number, unit: Unit): number {
  return value * MM_PER[unit];
}

export function from_mm(mm: number, unit: Unit): number {
  return mm / MM_PER[unit];
}

function trim(value: number, decimals: number): string {
  const text = value.toFixed(decimals);
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

export function format_number(mm: number, unit: Unit): string {
  const text = trim(from_mm(mm, unit), DECIMALS[unit]);
  return text === "-0" ? "0" : text;
}

export function format_length(mm: number, unit: Unit): string {
  return `${format_number(mm, unit)} ${unit}`;
}

export function type_key(text: string, key: string): string {
  if (key === NumpadKey.BACK) return text.slice(0, -1);
  if (text.length >= MAX_INPUT) return text;
  if (key === NumpadKey.POINT) {
    if (text.includes(".")) return text;
    return text ? `${text}.` : "0.";
  }
  if (!/^\d$/.test(key)) return text;
  if (text === "0") return key;
  return text + key;
}

export function round_mm(mm: number): number {
  return Math.round(mm * 100) / 100;
}

export function parse_input(text: string, unit: Unit): number | null {
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value) || value <= 0) return null;
  return round_mm(to_mm(value, unit));
}

/** Numbers separated by spaces, commas, `x` or `×`, each in `unit`, signs allowed: `80 x 40 x 200`, `0, -12.5, 30`. */
export function parse_numbers(text: string, unit: Unit): number[] | null {
  const parts = text
    .trim()
    .split(/[\s,;x×*]+/i)
    .filter(Boolean);
  if (!parts.length) return null;
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return values.map((value) => round_mm(to_mm(value, unit)));
}

export function input_for(mm: number, unit: Unit): string {
  return format_number(mm, unit);
}
