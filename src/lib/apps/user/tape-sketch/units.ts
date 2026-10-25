import { Unit } from "./model";

export const MM_PER: Record<Unit, number> = { [Unit.MM]: 1, [Unit.CM]: 10, [Unit.M]: 1000, [Unit.IN]: 25.4 };
const DECIMALS: Record<Unit, number> = { [Unit.MM]: 1, [Unit.CM]: 1, [Unit.M]: 3, [Unit.IN]: 2 };

export const UNIT_LABELS: Record<Unit, string> = {
  [Unit.MM]: "Millimetres",
  [Unit.CM]: "Centimetres",
  [Unit.M]: "Metres",
  [Unit.IN]: "Inches",
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
  return trim(from_mm(mm, unit), DECIMALS[unit]);
}

export function format_length(mm: number | null, unit: Unit): string {
  return mm === null ? "?" : `${format_number(mm, unit)} ${unit}`;
}

const SQ_FT = 92_903.04;
const SQ_IN = 645.16;

export function format_area(mm2: number, unit: Unit): string {
  if (unit === Unit.IN) return mm2 >= SQ_FT ? `${trim(mm2 / SQ_FT, 2)} ft²` : `${trim(mm2 / SQ_IN, 1)} in²`;
  return mm2 >= 100_000 ? `${trim(mm2 / 1e6, 2)} m²` : `${trim(mm2 / 100, 1)} cm²`;
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

export function input_for(mm: number | null, unit: Unit): string {
  return mm === null ? "" : format_number(mm, unit);
}
