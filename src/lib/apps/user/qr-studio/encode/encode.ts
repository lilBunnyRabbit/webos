import { apply_mask, draw_format, format_bits, function_grid, penalty, place, placement_order, type Grid, type Penalty } from "./matrix";
import { generator, remainder } from "./reed-solomon";
import {
  Charset,
  count_bits,
  latin2_segments,
  MODE_INDICATOR,
  optimal_segments,
  push_bits,
  segment_bits,
  single_segments,
  type Segment,
} from "./segments";
import {
  block_count,
  data_codewords,
  Ecc,
  ecc_per_block,
  ECC_LEVELS,
  MAX_VERSION,
  MIN_VERSION,
  total_codewords,
} from "./tables";

export const Segmentation = { OPTIMAL: "optimal", SINGLE: "single" } as const;
export type Segmentation = (typeof Segmentation)[keyof typeof Segmentation];

export interface EncodeOptions {
  ecc: Ecc;
  min_version?: number;
  max_version?: number;
  /** 0–7, or `null` to pick the one with the lowest penalty. */
  mask?: number | null;
  /** Raise the ECC level while the data still fits the same version. */
  boost_ecc?: boolean;
  charset?: Charset;
  segmentation?: Segmentation;
}

export const BitKind = {
  MODE: "mode",
  COUNT: "count",
  DATA: "data",
  TERMINATOR: "terminator",
  ALIGN: "align",
  PAD: "pad",
} as const;
export type BitKind = (typeof BitKind)[keyof typeof BitKind];

export interface BitPart {
  kind: BitKind;
  bits: number[];
  /** The segment it belongs to, for mode, count and data. */
  segment: number | null;
}

export interface Block {
  data: number[];
  ecc: number[];
}

export interface QrCode {
  version: number;
  ecc: Ecc;
  mask: number;
  size: number;
  modules: Uint8Array;
  regions: Uint8Array;
  /** Data placed, before any mask and with placeholder format bits. */
  unmasked: Uint8Array;
  segments: Segment[];
  parts: BitPart[];
  data_codewords: number[];
  blocks: Block[];
  /** Interleaved data then ECC codewords, in the order they are placed. */
  codewords: number[];
  order: Uint32Array;
  penalties: Penalty[];
}

export class CapacityError extends Error {
  readonly bits: number;
  readonly capacity: number;

  constructor(bits: number, capacity: number, ecc: Ecc, max_version: number) {
    super(
      Number.isFinite(bits)
        ? `Too much for one code: ${Math.ceil(bits / 8).toLocaleString()} bytes, version ${max_version} at ECC ${ecc} holds ${Math.floor(capacity / 8).toLocaleString()}`
        : `Too much for one code at ECC ${ecc}`
    );
    this.bits = bits;
    this.capacity = capacity;
  }
}

function segments_for(text: string, version: number, charset: Charset, segmentation: Segmentation): Segment[] {
  if (charset === Charset.LATIN2) return latin2_segments(text);
  return segmentation === Segmentation.OPTIMAL ? optimal_segments(text, version) : single_segments(text);
}

export function encode(text: string, options: EncodeOptions): QrCode {
  const min = options.min_version ?? MIN_VERSION;
  const max = options.max_version ?? MAX_VERSION;
  const charset = options.charset ?? Charset.UTF8;
  const segmentation = options.segmentation ?? Segmentation.OPTIMAL;
  if (min < MIN_VERSION || max > MAX_VERSION || min > max) throw new RangeError("Version out of range");

  let segments: Segment[] = [];
  for (let version = min; version <= max; version++) {
    // The count widths, and so the best split, only change at versions 10 and 27.
    if (version === min || version === 10 || version === 27) segments = segments_for(text, version, charset, segmentation);
    const bits = segment_bits(segments, version);
    if (bits <= data_codewords(version, options.ecc) * 8) return encode_segments(segments, { ...options, min_version: version, max_version: version });
    if (version === max) throw new CapacityError(bits, data_codewords(max, options.ecc) * 8, options.ecc, max);
  }
  throw new RangeError("Version out of range");
}

export function encode_segments(segments: Segment[], options: EncodeOptions): QrCode {
  const min = options.min_version ?? MIN_VERSION;
  const max = options.max_version ?? MAX_VERSION;
  let version = min;
  let used = segment_bits(segments, version);
  while (used > data_codewords(version, options.ecc) * 8) {
    if (version >= max) throw new CapacityError(used, data_codewords(max, options.ecc) * 8, options.ecc, max);
    used = segment_bits(segments, ++version);
  }

  let ecc = options.ecc;
  if (options.boost_ecc)
    for (const level of ECC_LEVELS.slice(ECC_LEVELS.indexOf(ecc) + 1)) if (used <= data_codewords(version, level) * 8) ecc = level;

  const parts = data_parts(segments, version, data_codewords(version, ecc) * 8);
  const data = to_bytes(parts.flatMap((part) => part.bits));
  const { blocks, codewords } = add_ecc(data, version, ecc);

  const grid = function_grid(version);
  const order = placement_order(grid);
  place(grid, order, codewords);
  const unmasked = grid.modules.slice();

  const penalties = Array.from({ length: 8 }, (_, mask) => penalty(masked(grid, unmasked, ecc, mask)));
  const mask = options.mask ?? penalties.reduce((best, score, i) => (score.total < penalties[best].total ? i : best), 0);
  const final = masked(grid, unmasked, ecc, mask);

  return {
    version,
    ecc,
    mask,
    size: grid.size,
    modules: final.modules,
    regions: final.regions,
    unmasked,
    segments,
    parts,
    data_codewords: data,
    blocks,
    codewords,
    order,
    penalties,
  };
}

export function masked(base: Grid, unmasked: Uint8Array, ecc: Ecc, mask: number): Grid {
  const grid: Grid = { size: base.size, modules: unmasked.slice(), regions: base.regions.slice() };
  apply_mask(grid, mask);
  draw_format(grid, format_bits(ecc, mask));
  return grid;
}

function data_parts(segments: Segment[], version: number, capacity: number): BitPart[] {
  const parts: BitPart[] = [];
  segments.forEach((segment, i) => {
    const mode: number[] = [];
    push_bits(mode, MODE_INDICATOR[segment.mode], 4);
    parts.push({ kind: BitKind.MODE, bits: mode, segment: i });
    const width = count_bits(segment.mode, version);
    if (width > 0) {
      const count: number[] = [];
      push_bits(count, segment.count, width);
      parts.push({ kind: BitKind.COUNT, bits: count, segment: i });
    }
    parts.push({ kind: BitKind.DATA, bits: segment.bits, segment: i });
  });

  let length = parts.reduce((sum, part) => sum + part.bits.length, 0);
  const terminator = Math.min(4, capacity - length);
  if (terminator > 0) parts.push({ kind: BitKind.TERMINATOR, bits: new Array(terminator).fill(0), segment: null });
  length += terminator;
  const align = (8 - (length % 8)) % 8;
  if (align > 0) parts.push({ kind: BitKind.ALIGN, bits: new Array(align).fill(0), segment: null });
  length += align;

  const pad: number[] = [];
  for (let byte = 0xec; length + pad.length < capacity; byte ^= 0xec ^ 0x11) push_bits(pad, byte, 8);
  if (pad.length) parts.push({ kind: BitKind.PAD, bits: pad, segment: null });
  return parts;
}

function to_bytes(bits: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  return out;
}

/** Splits the data into blocks, adds each one's ECC, then interleaves: first codeword of every block, then the second, … */
function add_ecc(data: number[], version: number, ecc: Ecc): { blocks: Block[]; codewords: number[] } {
  const count = block_count(version, ecc);
  const ecc_length = ecc_per_block(version, ecc);
  const total = total_codewords(version);
  const short_blocks = count - (total % count);
  const short_length = Math.floor(total / count) - ecc_length;
  const divisor = generator(ecc_length);

  const blocks: Block[] = [];
  for (let i = 0, k = 0; i < count; i++) {
    const length = short_length + (i < short_blocks ? 0 : 1);
    const slice = data.slice(k, k + length);
    k += length;
    blocks.push({ data: slice, ecc: remainder(slice, divisor) });
  }

  const codewords: number[] = [];
  for (let i = 0; i <= short_length; i++) for (const block of blocks) if (i < block.data.length) codewords.push(block.data[i]);
  for (let i = 0; i < ecc_length; i++) for (const block of blocks) codewords.push(block.ecc[i]);
  return { blocks, codewords };
}
