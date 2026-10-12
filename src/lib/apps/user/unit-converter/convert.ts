import { z } from "zod";
import { QUANTITIES, Quantity, TABLES, type Unit } from "./units";

export const SIGNIFICANT_DIGITS = 12;
const SCIENTIFIC_ABOVE = 1e12;
const SCIENTIFIC_BELOW = 1e-6;
const SUM_DIGITS = 15;

// Adding an offset leaves error at the larger operand's scale: 491.67 °R → °C gives 5.7e-14, not 0. Round it away there.
function add(a: number, b: number): number {
  const sum = a + b;
  if (b === 0) return sum;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  const decimals = SUM_DIGITS - 1 - Math.floor(Math.log10(scale));
  if (decimals <= 0 || decimals > 100) return sum;
  return Number(sum.toFixed(decimals));
}

export function to_base(value: number, unit: Unit): number {
  return add(value, unit.offset ?? 0) * unit.factor;
}

export function from_base(base: number, unit: Unit): number {
  return add(base / unit.factor, -(unit.offset ?? 0));
}

export function convert(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from_base(to_base(value, from), to);
}

// A lone comma is a decimal mark (2,5): typed thousands separators are rarer than European decimals.
export function parse_number(text: string): number | null {
  let cleaned = text.trim().replace(/[\s_]/g, "");
  if (cleaned === "") return null;
  if (!cleaned.includes(".") && cleaned.split(",").length === 2) cleaned = cleaned.replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

// Output goes back into editable fields, so it must stay parseable: no grouping, plain `e` exponent.
export function format_number(value: number, significant = SIGNIFICANT_DIGITS): string {
  if (!Number.isFinite(value)) return "";
  const rounded = Number(value.toPrecision(significant));
  if (rounded === 0) return "0";
  const magnitude = Math.abs(rounded);
  if (magnitude >= SCIENTIFIC_ABOVE || magnitude < SCIENTIFIC_BELOW) {
    return rounded.toExponential().replace("e+", "e");
  }
  return String(rounded);
}

export function find_unit(quantity: Quantity, id: string): Unit | undefined {
  return TABLES[quantity].units.find((unit) => unit.id === id);
}

export function unit_matches(unit: Unit, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  return [unit.name, unit.symbol, unit.id, unit.group ?? "", unit.note ?? ""].some((field) =>
    field.toLowerCase().includes(needle)
  );
}

export interface UnitGroup {
  label: string | null;
  units: Unit[];
}

export function group_units(units: Unit[]): UnitGroup[] {
  const groups: UnitGroup[] = [];
  for (const unit of units) {
    const label = unit.group ?? null;
    const last = groups.at(-1);
    if (last && last.label === label) last.units.push(unit);
    else groups.push({ label, units: [unit] });
  }
  return groups;
}

export interface QuantityMatch {
  quantity: Quantity;
  units: Unit[];
}

export function search_other_quantities(current: Quantity, query: string): QuantityMatch[] {
  if (query.trim() === "") return [];
  return QUANTITIES.filter((quantity) => quantity !== current)
    .map((quantity) => ({ quantity, units: TABLES[quantity].units.filter((unit) => unit_matches(unit, query)) }))
    .filter((match) => match.units.length > 0);
}

export function unit_label(unit: Unit): string {
  return unit.group ? `${unit.name} (${unit.symbol}) · ${short_group(unit.group)}` : `${unit.name} (${unit.symbol})`;
}

function short_group(group: string): string {
  return group.replace(/\s*\(.*\)$/, "");
}

const pair_schema = z.object({ from: z.string(), to: z.string() });

export const saved_state_schema = z.object({
  quantity: z.enum(Quantity),
  units: z.partialRecord(z.enum(Quantity), pair_schema),
});
export type SavedState = z.infer<typeof saved_state_schema>;

export interface UnitPair {
  from: Unit;
  to: Unit;
}

// Saved ids of a removed or renamed unit fall back to the table defaults.
export function resolve_pair(quantity: Quantity, saved: SavedState["units"][Quantity] | undefined): UnitPair {
  const table = TABLES[quantity];
  const from = (saved && find_unit(quantity, saved.from)) ?? find_unit(quantity, table.from)!;
  const to = (saved && find_unit(quantity, saved.to)) ?? find_unit(quantity, table.to)!;
  return { from, to };
}
