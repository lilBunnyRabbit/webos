import { extended_name, hex } from "./usages";

export const ReportKind = { INPUT: "input", OUTPUT: "output", FEATURE: "feature" } as const;
export type ReportKind = (typeof ReportKind)[keyof typeof ReportKind];

export interface ReportField {
  bit_offset: number;
  size: number;
  count: number;
  /** page << 16 | id; the last repeats when there are fewer usages than values. */
  usages: number[];
  usage_minimum: number | null;
  usage_maximum: number | null;
  logical_minimum: number;
  logical_maximum: number;
  constant: boolean;
  /** Array fields carry indexes of the usages that are on (key codes), not one value per usage. */
  array: boolean;
  relative: boolean;
}

export interface Report {
  kind: ReportKind;
  id: number;
  bits: number;
  fields: ReportField[];
}

export interface DecodedValue {
  label: string;
  value: string;
}

export function report_bytes(report: Report): number {
  return Math.ceil(report.bits / 8);
}

export function report_key(kind: ReportKind, id: number): string {
  return `${kind}:${id}`;
}

/** Little-endian bit run, as HID lays them out. Bits past the end read as 0. */
export function read_bits(data: Uint8Array, offset: number, size: number): number {
  let value = 0;
  for (let bit = 0; bit < size; bit++) {
    const at = offset + bit;
    const byte = data[at >> 3] ?? 0;
    if ((byte >> (at & 7)) & 1) value += 2 ** bit;
  }
  return value;
}

function to_signed(value: number, size: number): number {
  return size > 0 && value >= 2 ** (size - 1) ? value - 2 ** size : value;
}

function usage_at(field: ReportField, index: number): number | null {
  if (field.usage_minimum !== null) {
    const usage = field.usage_minimum + index;
    return field.usage_maximum === null || usage <= field.usage_maximum ? usage : null;
  }
  return field.usages[index] ?? field.usages.at(-1) ?? null;
}

export function field_values(field: ReportField, data: Uint8Array): number[] {
  const signed = field.logical_minimum < 0;
  return Array.from({ length: field.count }, (_, index) => {
    const raw = read_bits(data, field.bit_offset + index * field.size, field.size);
    return signed ? to_signed(raw, field.size) : raw;
  });
}

export function field_label(field: ReportField): string {
  if (field.constant) return "Padding";
  if (field.usage_minimum !== null) {
    const first = extended_name(field.usage_minimum);
    return field.usage_maximum !== null && field.usage_maximum !== field.usage_minimum
      ? `${first} … ${extended_name(field.usage_maximum)}`
      : first;
  }
  const names = [...new Set(field.usages.map(extended_name))];
  return names.length ? names.join(", ") : "No usage";
}

export function decode_report(report: Report, data: Uint8Array): DecodedValue[] {
  const decoded: DecodedValue[] = [];
  for (const field of report.fields) {
    if (field.constant) continue;
    const values = field_values(field, data);
    if (field.array) {
      const on = values
        .filter((value) => value >= field.logical_minimum && value <= field.logical_maximum)
        .map((value) => usage_at(field, value - field.logical_minimum))
        .filter((usage) => usage === null || (usage & 0xffff) !== 0)
        .map((usage) => (usage === null ? "?" : extended_name(usage)));
      decoded.push({ label: field_label(field), value: on.length ? on.join(" + ") : "none" });
      continue;
    }
    values.forEach((value, index) => {
      const usage = usage_at(field, index);
      decoded.push({ label: usage === null ? `Value ${index}` : extended_name(usage), value: String(value) });
    });
  }
  return decoded;
}

export function format_hex(data: Uint8Array): string {
  return Array.from(data, (byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

export function report_title(report: Report): string {
  const kind = report.kind[0].toUpperCase() + report.kind.slice(1);
  return report.id === 0 ? kind : `${kind} ${hex(report.id)}`;
}
