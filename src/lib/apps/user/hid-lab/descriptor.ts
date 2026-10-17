import { report_key, ReportKind, type Report, type ReportField } from "./report";
import { collection_name, extended_usage, hex, page_name, split_usage, usage_name } from "./usages";

export const ItemType = { MAIN: "main", GLOBAL: "global", LOCAL: "local", LONG: "long", RESERVED: "reserved" } as const;
export type ItemType = (typeof ItemType)[keyof typeof ItemType];

export interface DescriptorItem {
  offset: number;
  bytes: Uint8Array;
  type: ItemType;
  tag: string;
  text: string;
  depth: number;
}

export interface Collection {
  type: number;
  usage: number | null;
  children: Collection[];
}

export interface ParsedDescriptor {
  items: DescriptorItem[];
  collections: Collection[];
  reports: Report[];
  /** Set when the bytes ran out mid-item or collections didn't close; what parsed before it stays. */
  error: string | null;
}

interface Globals {
  usage_page: number;
  logical_minimum: number;
  logical_maximum: number;
  report_size: number;
  report_count: number;
  report_id: number;
}

interface Locals {
  usages: number[];
  usage_minimum: number | null;
  usage_maximum: number | null;
}

const MAIN_TAGS: Record<number, string> = { 0x8: "Input", 0x9: "Output", 0xa: "Collection", 0xb: "Feature", 0xc: "End Collection" };
const GLOBAL_TAGS: Record<number, string> = {
  0x0: "Usage Page",
  0x1: "Logical Minimum",
  0x2: "Logical Maximum",
  0x3: "Physical Minimum",
  0x4: "Physical Maximum",
  0x5: "Unit Exponent",
  0x6: "Unit",
  0x7: "Report Size",
  0x8: "Report ID",
  0x9: "Report Count",
  0xa: "Push",
  0xb: "Pop",
};
const LOCAL_TAGS: Record<number, string> = {
  0x0: "Usage",
  0x1: "Usage Minimum",
  0x2: "Usage Maximum",
  0x3: "Designator Index",
  0x4: "Designator Minimum",
  0x5: "Designator Maximum",
  0x7: "String Index",
  0x8: "String Minimum",
  0x9: "String Maximum",
  0xa: "Delimiter",
};

const FLAG_NAMES: [string, string][] = [
  ["Data", "Constant"],
  ["Array", "Variable"],
  ["Absolute", "Relative"],
  ["No Wrap", "Wrap"],
  ["Linear", "Non Linear"],
  ["Preferred State", "No Preferred"],
  ["No Null Position", "Null State"],
  ["Non Volatile", "Volatile"],
  ["Bit Field", "Buffered Bytes"],
];

export function main_flags(value: number, kind: ReportKind): string {
  const base = FLAG_NAMES.slice(0, 3).map(([off, on], bit) => ((value >> bit) & 1 ? on : off));
  // Bit 7 (volatile) is reserved on Input items.
  const extra = FLAG_NAMES.slice(3)
    .map(([, on], index) => ({ on, bit: index + 3 }))
    .filter(({ bit }) => (value >> bit) & 1 && !(bit === 7 && kind === ReportKind.INPUT))
    .map(({ on }) => on);
  return [...base, ...extra].join(", ");
}

function unsigned(bytes: Uint8Array): number {
  let value = 0;
  for (let index = bytes.length - 1; index >= 0; index--) value = value * 256 + bytes[index];
  return value;
}

function signed(bytes: Uint8Array): number {
  const value = unsigned(bytes);
  const bits = bytes.length * 8;
  return bits > 0 && value >= 2 ** (bits - 1) ? value - 2 ** bits : value;
}

export function parse_hex(text: string): Uint8Array | null {
  const cleaned = text.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = cleaned.match(/0x[0-9a-f]{1,2}\b|[0-9a-f]+/gi) ?? [];
  const bytes: number[] = [];
  for (const token of tokens) {
    const digits = token.replace(/^0x/i, "");
    if (digits.length > 2 && !token.startsWith("0x") && digits.length % 2 === 0) {
      for (let index = 0; index < digits.length; index += 2) bytes.push(parseInt(digits.slice(index, index + 2), 16));
    } else if (digits.length <= 2) {
      bytes.push(parseInt(digits, 16));
    } else {
      return null;
    }
  }
  return bytes.length ? new Uint8Array(bytes) : null;
}

export function parse_descriptor(data: Uint8Array): ParsedDescriptor {
  const items: DescriptorItem[] = [];
  const roots: Collection[] = [];
  const open: Collection[] = [];
  const reports = new Map<string, Report>();
  const stack: Globals[] = [];
  let globals: Globals = { usage_page: 0, logical_minimum: 0, logical_maximum: 0, report_size: 0, report_count: 0, report_id: 0 };
  let locals: Locals = { usages: [], usage_minimum: null, usage_maximum: null };
  let error: string | null = null;
  let offset = 0;

  const extend = (bytes: Uint8Array) => {
    const value = unsigned(bytes);
    return bytes.length === 4 ? value : extended_usage(globals.usage_page, value);
  };
  const usage_text = (bytes: Uint8Array) => {
    const { page, usage } = split_usage(extend(bytes));
    return bytes.length === 4 ? `${page_name(page)}: ${usage_name(page, usage)}` : usage_name(page, usage);
  };

  const add_field = (kind: ReportKind, flags: number) => {
    const key = report_key(kind, globals.report_id);
    const report = reports.get(key) ?? { kind, id: globals.report_id, bits: 0, fields: [] };
    reports.set(key, report);
    const field: ReportField = {
      bit_offset: report.bits,
      size: globals.report_size,
      count: globals.report_count,
      usages: locals.usages,
      usage_minimum: locals.usage_minimum,
      usage_maximum: locals.usage_maximum,
      logical_minimum: globals.logical_minimum,
      logical_maximum: globals.logical_maximum,
      constant: (flags & 1) === 1,
      array: (flags & 2) === 0,
      relative: (flags & 4) === 4,
    };
    report.fields.push(field);
    report.bits += field.size * field.count;
  };

  while (offset < data.length) {
    const prefix = data[offset];
    if (prefix === 0xfe) {
      const size = data[offset + 1] ?? 0;
      const end = offset + 3 + size;
      if (end > data.length) {
        error = `Long item at ${offset} runs past the end`;
        break;
      }
      items.push({ offset, bytes: data.slice(offset, end), type: ItemType.LONG, tag: "Long Item", text: `Long Item (${size} bytes)`, depth: open.length });
      offset = end;
      continue;
    }

    const size = [0, 1, 2, 4][prefix & 3];
    const type_bits = (prefix >> 2) & 3;
    const tag_bits = prefix >> 4;
    if (offset + 1 + size > data.length) {
      error = `Item ${hex(prefix)} at ${offset} needs ${size} data bytes; the descriptor ends first`;
      break;
    }
    const value_bytes = data.slice(offset + 1, offset + 1 + size);
    const value = unsigned(value_bytes);
    let type: ItemType = ItemType.RESERVED;
    let tag = `Reserved ${hex(prefix)}`;
    let text = tag;
    let depth = open.length;

    if (type_bits === 0) {
      type = ItemType.MAIN;
      tag = MAIN_TAGS[tag_bits] ?? tag;
      if (tag_bits === 0x8 || tag_bits === 0x9 || tag_bits === 0xb) {
        const kind = tag_bits === 0x8 ? ReportKind.INPUT : tag_bits === 0x9 ? ReportKind.OUTPUT : ReportKind.FEATURE;
        text = `${tag} (${main_flags(value, kind)})`;
        add_field(kind, value);
      } else if (tag_bits === 0xa) {
        text = `${tag} (${collection_name(value)})`;
        const collection: Collection = { type: value, usage: locals.usages[0] ?? locals.usage_minimum, children: [] };
        (open.at(-1)?.children ?? roots).push(collection);
        open.push(collection);
      } else if (tag_bits === 0xc) {
        if (open.length === 0) error ??= `End Collection at ${offset} without a Collection`;
        open.pop();
        depth = open.length;
        text = tag;
      } else {
        text = tag;
      }
      locals = { usages: [], usage_minimum: null, usage_maximum: null };
    } else if (type_bits === 1) {
      type = ItemType.GLOBAL;
      tag = GLOBAL_TAGS[tag_bits] ?? tag;
      text = `${tag} (${value})`;
      switch (tag_bits) {
        case 0x0:
          globals.usage_page = value;
          text = `${tag} (${page_name(value)})`;
          break;
        case 0x1:
          globals.logical_minimum = signed(value_bytes);
          text = `${tag} (${globals.logical_minimum})`;
          break;
        case 0x2:
          // Signed by the spec, but devices write 0xFF meaning 255 with a minimum of 0; trust the minimum.
          globals.logical_maximum = globals.logical_minimum >= 0 ? value : signed(value_bytes);
          text = `${tag} (${globals.logical_maximum})`;
          break;
        case 0x3:
        case 0x4:
          text = `${tag} (${signed(value_bytes)})`;
          break;
        case 0x6:
          text = `${tag} (${hex(value, size * 2)})`;
          break;
        case 0x7:
          globals.report_size = value;
          break;
        case 0x8:
          globals.report_id = value;
          text = `${tag} (${hex(value)})`;
          break;
        case 0x9:
          globals.report_count = value;
          break;
        case 0xa:
          stack.push({ ...globals });
          text = tag;
          break;
        case 0xb:
          globals = stack.pop() ?? globals;
          text = tag;
          break;
      }
    } else if (type_bits === 2) {
      type = ItemType.LOCAL;
      tag = LOCAL_TAGS[tag_bits] ?? tag;
      text = `${tag} (${value})`;
      if (tag_bits === 0x0) {
        locals.usages = [...locals.usages, extend(value_bytes)];
        text = `${tag} (${usage_text(value_bytes)})`;
      } else if (tag_bits === 0x1) {
        locals.usage_minimum = extend(value_bytes);
        text = `${tag} (${usage_text(value_bytes)})`;
      } else if (tag_bits === 0x2) {
        locals.usage_maximum = extend(value_bytes);
        text = `${tag} (${usage_text(value_bytes)})`;
      }
    }

    items.push({ offset, bytes: data.slice(offset, offset + 1 + size), type, tag, text, depth });
    offset += 1 + size;
  }

  if (!error && open.length > 0) error = `${open.length} collection${open.length === 1 ? "" : "s"} never closed`;
  const order = [ReportKind.INPUT, ReportKind.OUTPUT, ReportKind.FEATURE];
  const sorted = [...reports.values()].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.id - b.id);
  return { items, collections: roots, reports: sorted, error };
}

export const SAMPLES = [
  {
    name: "Boot keyboard",
    hex: `05 01 09 06 A1 01 05 07 19 E0 29 E7 15 00 25 01 75 01 95 08 81 02 95 01 75 08 81 01
95 05 75 01 05 08 19 01 29 05 91 02 95 01 75 03 91 01 95 06 75 08 15 00 25 65 05 07
19 00 29 65 81 00 C0`,
  },
  {
    name: "Boot mouse",
    hex: `05 01 09 02 A1 01 09 01 A1 00 05 09 19 01 29 03 15 00 25 01 95 03 75 01 81 02 95 01
75 05 81 01 05 01 09 30 09 31 09 38 15 81 25 7F 75 08 95 03 81 06 C0 C0`,
  },
  {
    name: "Gamepad",
    hex: `05 01 09 05 A1 01 85 01 05 09 19 01 29 10 15 00 25 01 75 01 95 10 81 02 05 01 09 39
15 00 25 07 35 00 46 3B 01 65 14 75 04 95 01 81 42 75 04 95 01 81 01 09 30 09 31 09 32
09 35 15 00 26 FF 00 75 08 95 04 81 02 C0`,
  },
] as const;
