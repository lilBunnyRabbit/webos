// Runs alternate space, bar, space, …: index 0 is a space (zero wide when the line starts dark), so bars sit at odd
// indices. Every decoder takes the index of its first bar and reads widths from there.

export const LinearFormat = {
  EAN_13: "ean_13",
  UPC_A: "upc_a",
  EAN_8: "ean_8",
  UPC_E: "upc_e",
  CODE_128: "code_128",
  CODE_39: "code_39",
} as const;
export type LinearFormat = (typeof LinearFormat)[keyof typeof LinearFormat];

export interface LinearCode {
  value: string;
  format: LinearFormat;
}

// ZXing's tolerances: average deviation per module, and the most one element may be off, both in module widths.
const EAN_AVERAGE = 0.48;
const CODE128_AVERAGE = 0.25;
const MOST_OFF = 0.7;

export function pattern_variance(runs: readonly number[], at: number, pattern: readonly number[], most_off = MOST_OFF): number {
  if (at < 0 || at + pattern.length > runs.length) return Infinity;
  let total = 0;
  let modules = 0;
  for (let i = 0; i < pattern.length; i++) {
    total += runs[at + i];
    modules += pattern[i];
  }
  if (total < modules) return Infinity;
  const unit = total / modules;
  const limit = most_off * unit;
  let variance = 0;
  for (let i = 0; i < pattern.length; i++) {
    const off = Math.abs(runs[at + i] - pattern[i] * unit);
    if (off > limit) return Infinity;
    variance += off;
  }
  return variance / total;
}

function width_of(runs: readonly number[], at: number, count: number): number {
  let total = 0;
  for (let i = at; i < at + count; i++) total += runs[i];
  return total;
}

function best_match(runs: readonly number[], at: number, patterns: readonly (readonly number[])[], limit: number): number {
  let best = -1;
  let best_variance = limit;
  patterns.forEach((pattern, index) => {
    const variance = pattern_variance(runs, at, pattern);
    if (variance < best_variance) {
      best_variance = variance;
      best = index;
    }
  });
  return best;
}

// Light on both sides of a code, less than the specs ask so a tightly cropped photo still reads.
function has_quiet_zone(runs: readonly number[], start: number, needed: number): boolean {
  return start >= 1 && runs[start - 1] >= needed;
}

function quiet_after(runs: readonly number[], end: number, needed: number): boolean {
  return (runs[end] ?? 0) >= needed;
}

export function gtin_check(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

const EAN_L = [
  [3, 2, 1, 1],
  [2, 2, 2, 1],
  [2, 1, 2, 2],
  [1, 4, 1, 1],
  [1, 1, 3, 2],
  [1, 2, 3, 1],
  [1, 1, 1, 4],
  [1, 3, 1, 2],
  [1, 2, 1, 3],
  [3, 1, 1, 2],
] as const;
const EAN_G = EAN_L.map((pattern) => [...pattern].reverse());
const EAN_LG = [...EAN_L, ...EAN_G];
const GUARD = [1, 1, 1];
const MIDDLE = [1, 1, 1, 1, 1];
const UPCE_END = [1, 1, 1, 1, 1, 1];
// Which of the six left digits use the G set (bit 5 = first digit), for each first digit of an EAN-13.
const EAN13_FIRST = [0x00, 0x0b, 0x0d, 0x0e, 0x13, 0x19, 0x1c, 0x15, 0x16, 0x1a];
// The same for UPC-E with number system 0, keyed by check digit; number system 1 is the inverse.
const UPCE_PARITY = [0x38, 0x34, 0x32, 0x31, 0x2c, 0x26, 0x23, 0x2a, 0x29, 0x25];

function start_guard(runs: readonly number[], start: number): boolean {
  if (pattern_variance(runs, start, GUARD) >= EAN_AVERAGE) return false;
  return has_quiet_zone(runs, start, width_of(runs, start, 3));
}

/** Left-half digits: each with its parity bit (1 = G set). */
function left_digits(runs: readonly number[], at: number, count: number, with_g: boolean): { digits: number[]; parity: number } | null {
  const digits: number[] = [];
  let parity = 0;
  for (let i = 0; i < count; i++) {
    const match = best_match(runs, at + i * 4, with_g ? EAN_LG : EAN_L, EAN_AVERAGE);
    if (match < 0) return null;
    digits.push(match % 10);
    parity = (parity << 1) | (match >= 10 ? 1 : 0);
  }
  return { digits, parity };
}

function right_digits(runs: readonly number[], at: number, count: number): number[] | null {
  const digits: number[] = [];
  for (let i = 0; i < count; i++) {
    const match = best_match(runs, at + i * 4, EAN_L, EAN_AVERAGE);
    if (match < 0) return null;
    digits.push(match);
  }
  return digits;
}

export function decode_ean13(runs: readonly number[], start: number): string | null {
  if (!start_guard(runs, start)) return null;
  const left = left_digits(runs, start + 3, 6, true);
  if (!left) return null;
  const middle = start + 3 + 24;
  if (pattern_variance(runs, middle, MIDDLE) >= EAN_AVERAGE) return null;
  const right = right_digits(runs, middle + 5, 6);
  if (!right) return null;
  const end = middle + 5 + 24;
  if (pattern_variance(runs, end, GUARD) >= EAN_AVERAGE || !quiet_after(runs, end + 3, width_of(runs, end, 3))) return null;
  const first = EAN13_FIRST.indexOf(left.parity);
  if (first < 0) return null;
  const code = `${first}${left.digits.join("")}${right.join("")}`;
  return gtin_check(code.slice(0, 12)) === Number(code[12]) ? code : null;
}

export function decode_ean8(runs: readonly number[], start: number): string | null {
  if (!start_guard(runs, start)) return null;
  const left = left_digits(runs, start + 3, 4, false);
  if (!left) return null;
  const middle = start + 3 + 16;
  if (pattern_variance(runs, middle, MIDDLE) >= EAN_AVERAGE) return null;
  const right = right_digits(runs, middle + 5, 4);
  if (!right) return null;
  const end = middle + 5 + 16;
  if (pattern_variance(runs, end, GUARD) >= EAN_AVERAGE || !quiet_after(runs, end + 3, width_of(runs, end, 3))) return null;
  const code = `${left.digits.join("")}${right.join("")}`;
  return gtin_check(code.slice(0, 7)) === Number(code[7]) ? code : null;
}

export function upce_to_upca(code: string): string {
  const [system, a, b, c, d, e, last] = code.slice(0, 7);
  if (last <= "2") return `${system}${a}${b}${last}0000${c}${d}${e}`;
  if (last === "3") return `${system}${a}${b}${c}00000${d}${e}`;
  if (last === "4") return `${system}${a}${b}${c}${d}00000${e}`;
  return `${system}${a}${b}${c}${d}${e}0000${last}`;
}

export function decode_upce(runs: readonly number[], start: number): string | null {
  if (!start_guard(runs, start)) return null;
  const left = left_digits(runs, start + 3, 6, true);
  if (!left) return null;
  const end = start + 3 + 24;
  if (pattern_variance(runs, end, UPCE_END) >= EAN_AVERAGE || !quiet_after(runs, end + 6, width_of(runs, end, 6) / 2)) return null;
  for (const system of [0, 1]) {
    const check = UPCE_PARITY.indexOf(system === 0 ? left.parity : left.parity ^ 0x3f);
    if (check < 0) continue;
    const code = `${system}${left.digits.join("")}${check}`;
    if (gtin_check(upce_to_upca(code)) === check) return code;
  }
  return null;
}

const CODE128 = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3], [1, 2, 1, 3, 2, 2],
  [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2], [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3],
  [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2], [1, 1, 2, 2, 3, 2], [1, 2, 2, 1, 3, 2], [1, 2, 2, 2, 3, 1],
  [1, 1, 3, 2, 2, 2], [1, 2, 3, 1, 2, 2], [1, 2, 3, 2, 2, 1], [2, 2, 3, 2, 1, 1], [2, 2, 1, 1, 3, 2],
  [2, 2, 1, 2, 3, 1], [2, 1, 3, 2, 1, 2], [2, 2, 3, 1, 1, 2], [3, 1, 2, 1, 3, 1], [3, 1, 1, 2, 2, 2],
  [3, 2, 1, 1, 2, 2], [3, 2, 1, 2, 2, 1], [3, 1, 2, 2, 1, 2], [3, 2, 2, 1, 1, 2], [3, 2, 2, 2, 1, 1],
  [2, 1, 2, 1, 2, 3], [2, 1, 2, 3, 2, 1], [2, 3, 2, 1, 2, 1], [1, 1, 1, 3, 2, 3], [1, 3, 1, 1, 2, 3],
  [1, 3, 1, 3, 2, 1], [1, 1, 2, 3, 1, 3], [1, 3, 2, 1, 1, 3], [1, 3, 2, 3, 1, 1], [2, 1, 1, 3, 1, 3],
  [2, 3, 1, 1, 1, 3], [2, 3, 1, 3, 1, 1], [1, 1, 2, 1, 3, 3], [1, 1, 2, 3, 3, 1], [1, 3, 2, 1, 3, 1],
  [1, 1, 3, 1, 2, 3], [1, 1, 3, 3, 2, 1], [1, 3, 3, 1, 2, 1], [3, 1, 3, 1, 2, 1], [2, 1, 1, 3, 3, 1],
  [2, 3, 1, 1, 3, 1], [2, 1, 3, 1, 1, 3], [2, 1, 3, 3, 1, 1], [2, 1, 3, 1, 3, 1], [3, 1, 1, 1, 2, 3],
  [3, 1, 1, 3, 2, 1], [3, 3, 1, 1, 2, 1], [3, 1, 2, 1, 1, 3], [3, 1, 2, 3, 1, 1], [3, 3, 2, 1, 1, 1],
  [3, 1, 4, 1, 1, 1], [2, 2, 1, 4, 1, 1], [4, 3, 1, 1, 1, 1], [1, 1, 1, 2, 2, 4], [1, 1, 1, 4, 2, 2],
  [1, 2, 1, 1, 2, 4], [1, 2, 1, 4, 2, 1], [1, 4, 1, 1, 2, 2], [1, 4, 1, 2, 2, 1], [1, 1, 2, 2, 1, 4],
  [1, 1, 2, 4, 1, 2], [1, 2, 2, 1, 1, 4], [1, 2, 2, 4, 1, 1], [1, 4, 2, 1, 1, 2], [1, 4, 2, 2, 1, 1],
  [2, 4, 1, 2, 1, 1], [2, 2, 1, 1, 1, 4], [4, 1, 3, 1, 1, 1], [2, 4, 1, 1, 1, 2], [1, 3, 4, 1, 1, 1],
  [1, 1, 1, 2, 4, 2], [1, 2, 1, 1, 4, 2], [1, 2, 1, 2, 4, 1], [1, 1, 4, 2, 1, 2], [1, 2, 4, 1, 1, 2],
  [1, 2, 4, 2, 1, 1], [4, 1, 1, 2, 1, 2], [4, 2, 1, 1, 1, 2], [4, 2, 1, 2, 1, 1], [2, 1, 2, 1, 4, 1],
  [2, 1, 4, 1, 2, 1], [4, 1, 2, 1, 2, 1], [1, 1, 1, 1, 4, 3], [1, 1, 1, 3, 4, 1], [1, 3, 1, 1, 4, 1],
  [1, 1, 4, 1, 1, 3], [1, 1, 4, 3, 1, 1], [4, 1, 1, 1, 1, 3], [4, 1, 1, 3, 1, 1], [1, 1, 3, 1, 4, 1],
  [1, 1, 4, 1, 3, 1], [3, 1, 1, 1, 4, 1], [4, 1, 1, 1, 3, 1], [2, 1, 1, 4, 1, 2], [2, 1, 1, 2, 1, 4],
  [2, 1, 1, 2, 3, 2],
] as const;
export const CODE128_PATTERNS: readonly (readonly number[])[] = CODE128;
const CODE128_STOP = [2, 3, 3, 1, 1, 1, 2];
const Code128 = { SHIFT: 98, CODE_C: 99, CODE_B: 100, CODE_A: 101, FNC1: 102, START_A: 103, START_B: 104, START_C: 105 } as const;
const CodeSet = { A: "a", B: "b", C: "c" } as const;
type CodeSet = (typeof CodeSet)[keyof typeof CodeSet];

function code128_text(values: readonly number[]): string | null {
  let set: CodeSet = values[0] === Code128.START_A ? CodeSet.A : values[0] === Code128.START_B ? CodeSet.B : CodeSet.C;
  let shifted = false;
  let text = "";
  for (const value of values.slice(1)) {
    const current: CodeSet = shifted ? (set === CodeSet.A ? CodeSet.B : CodeSet.A) : set;
    shifted = false;
    if (current === CodeSet.C) {
      if (value < 100) text += String(value).padStart(2, "0");
      else if (value === Code128.CODE_B) set = CodeSet.B;
      else if (value === Code128.CODE_A) set = CodeSet.A;
      else if (value !== Code128.FNC1) return null;
      continue;
    }
    if (value < 64) text += String.fromCharCode(32 + value);
    else if (value < 96) text += String.fromCharCode(current === CodeSet.A ? value - 64 : 32 + value);
    else if (value === Code128.SHIFT) shifted = true;
    else if (value === Code128.CODE_C) set = CodeSet.C;
    else if (value === Code128.CODE_A && current === CodeSet.B) set = CodeSet.A;
    else if (value === Code128.CODE_B && current === CodeSet.A) set = CodeSet.B;
    else if (value > Code128.FNC1) return null;
  }
  return text;
}

export function decode_code128(runs: readonly number[], start: number): string | null {
  const first = best_match(runs, start, CODE128_PATTERNS, CODE128_AVERAGE);
  if (first < Code128.START_A) return null;
  if (!has_quiet_zone(runs, start, width_of(runs, start, 6) / 2)) return null;
  const values = [first];
  let at = start + 6;
  for (;;) {
    if (pattern_variance(runs, at, CODE128_STOP) < CODE128_AVERAGE) {
      if (!quiet_after(runs, at + 7, width_of(runs, at, 7) / 4)) return null;
      break;
    }
    const value = best_match(runs, at, CODE128_PATTERNS, CODE128_AVERAGE);
    if (value < 0 || value >= Code128.START_A) return null;
    values.push(value);
    at += 6;
  }
  if (values.length < 3) return null;
  const check = values.pop()!;
  const sum = values.reduce((total, value, index) => total + value * Math.max(index, 1), 0);
  if (sum % 103 !== check) return null;
  const text = code128_text(values);
  return text ? text : null;
}

const CODE39_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%";
const CODE39_WIDE = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064, 0x109, 0x049, 0x148, 0x019, 0x118, 0x058, 0x00d,
  0x10c, 0x04c, 0x01c, 0x103, 0x043, 0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016, 0x181, 0x0c1, 0x1c0, 0x091,
  0x190, 0x0d0, 0x085, 0x184, 0x0c4, 0x0a8, 0x0a2, 0x08a, 0x02a,
];
const CODE39_STAR = 0x094;

/**
 * Nine elements as wide/narrow bits (first element highest), or -1 unless exactly three stand out as wide. ZXing's way:
 * raise the narrow limit until three are left above it, none of them half the wide total on its own.
 */
function code39_bits(runs: readonly number[], at: number): number {
  if (at + 9 > runs.length) return -1;
  const widths = runs.slice(at, at + 9);
  let narrow = 0;
  for (;;) {
    const next = Math.min(...widths.filter((width) => width > narrow));
    if (!Number.isFinite(next)) return -1;
    narrow = next;
    const wide = widths.filter((width) => width > narrow);
    if (wide.length < 3) return -1;
    if (wide.length > 3) continue;
    const total = wide.reduce((sum, width) => sum + width, 0);
    if (wide.some((width) => width * 2 >= total)) return -1;
    return widths.reduce((bits, width) => (bits << 1) | (width > narrow ? 1 : 0), 0);
  }
}

export function decode_code39(runs: readonly number[], start: number): string | null {
  if (code39_bits(runs, start) !== CODE39_STAR) return null;
  const char_width = width_of(runs, start, 9);
  if (!has_quiet_zone(runs, start, char_width / 4)) return null;
  let text = "";
  let at = start + 10;
  for (;;) {
    const gap = runs[at - 1];
    if (gap === undefined || gap > char_width / 3) return null;
    const bits = code39_bits(runs, at);
    if (bits < 0) return null;
    const width = width_of(runs, at, 9);
    if (Math.abs(width - char_width) > char_width * 0.25) return null;
    if (bits === CODE39_STAR) {
      if (!quiet_after(runs, at + 9, char_width / 4)) return null;
      break;
    }
    const index = CODE39_WIDE.indexOf(bits);
    if (index < 0) return null;
    text += CODE39_CHARS[index];
    at += 10;
  }
  return text.length > 0 ? text : null;
}
