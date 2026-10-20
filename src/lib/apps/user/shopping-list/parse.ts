export interface Entry {
  text: string;
  qty?: number;
  unit?: string;
}

const NUMBER = String.raw`(\d+(?:[.,]\d+)?)`;
const UNITS = ["kg", "dag", "g", "mg", "l", "dl", "cl", "ml", "kos", "kom", "pcs", "pc", "pkg", "pack", "pak"];
const UNIT = `(${UNITS.join("|")})\\.?`;
const TIMES = "(?:x|×)";

const LEADING_TIMES = new RegExp(`^${NUMBER}\\s*${TIMES}\\s+(.+)$`, "i");
const LEADING_UNIT = new RegExp(`^${NUMBER}\\s*${UNIT}\\s+(.+)$`, "i");
const LEADING = new RegExp(`^${NUMBER}\\s+(.+)$`);
const TRAILING_UNIT = new RegExp(`^(.+?)\\s+${NUMBER}\\s*${UNIT}$`, "i");
const TRAILING_TIMES = new RegExp(`^(.+?)\\s+(?:${NUMBER}\\s*${TIMES}|${TIMES}\\s*${NUMBER})$`, "i");

const to_number = (text: string) => Number(text.replace(",", "."));
const has_letter = (text: string) => /\p{L}/u.test(text);

function entry(text: string, qty: string | undefined, unit?: string): Entry | null {
  const value = qty === undefined ? NaN : to_number(qty);
  if (!has_letter(text) || !(value > 0)) return null;
  return unit ? { text, qty: value, unit: unit.toLowerCase() } : { text, qty: value };
}

/**
 * "2x mleko", "500 g moka", "mleko 2x", "moka 500g", "jajca x10": the amount comes off, the rest is the item. A bare
 * trailing number stays in the name: "omega 3", "WD 40".
 */
export function parse_entry(input: string): Entry {
  const text = input.trim().replace(/\s+/g, " ");
  let match: RegExpMatchArray | null;
  let found: Entry | null = null;
  if ((match = text.match(LEADING_TIMES))) found = entry(match[2], match[1]);
  else if ((match = text.match(LEADING_UNIT))) found = entry(match[3], match[1], match[2]);
  else if ((match = text.match(LEADING))) found = entry(match[2], match[1]);
  else if ((match = text.match(TRAILING_UNIT))) found = entry(match[1], match[2], match[3]);
  else if ((match = text.match(TRAILING_TIMES))) found = entry(match[1], match[2] ?? match[3]);
  return found ?? { text };
}

const format_number = (value: number) => String(Math.round(value * 1000) / 1000).replace(".", ",");

export function format_amount(entry: Pick<Entry, "qty" | "unit">): string {
  if (entry.qty === undefined) return "";
  return entry.unit ? `${format_number(entry.qty)} ${entry.unit}` : `${format_number(entry.qty)}×`;
}

/** What the entry field shows when an item is edited; parses back to the same entry. */
export function entry_text(entry: Entry): string {
  if (entry.qty === undefined) return entry.text;
  return entry.unit ? `${format_number(entry.qty)} ${entry.unit} ${entry.text}` : `${format_number(entry.qty)}x ${entry.text}`;
}
