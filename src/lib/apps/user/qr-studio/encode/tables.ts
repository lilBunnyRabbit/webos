export const Ecc = { L: "L", M: "M", Q: "Q", H: "H" } as const;
export type Ecc = (typeof Ecc)[keyof typeof Ecc];

export const ECC_LEVELS: Ecc[] = [Ecc.L, Ecc.M, Ecc.Q, Ecc.H];

export const ECC_RECOVERY: Record<Ecc, number> = { L: 7, M: 15, Q: 25, H: 30 };

// Not in L, M, Q, H order: the spec numbers them M=0, L=1, H=2, Q=3.
export const ECC_FORMAT_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

export const MIN_VERSION = 1;
export const MAX_VERSION = 40;

// ISO/IEC 18004 table 9, indexed by version (index 0 unused).
const ECC_CODEWORDS_PER_BLOCK: Record<Ecc, number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
};

const ECC_BLOCKS: Record<Ecc, number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
};

export function ecc_per_block(version: number, ecc: Ecc): number {
  return ECC_CODEWORDS_PER_BLOCK[ecc][version];
}

export function block_count(version: number, ecc: Ecc): number {
  return ECC_BLOCKS[ecc][version];
}

export function symbol_size(version: number): number {
  return version * 4 + 17;
}

export function alignment_positions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const out = [6];
  for (let position = symbol_size(version) - 7; out.length < count; position -= step) out.splice(1, 0, position);
  return out;
}

export function raw_data_modules(version: number): number {
  let out = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const count = Math.floor(version / 7) + 2;
    out -= (25 * count - 10) * count - 55;
    if (version >= 7) out -= 36;
  }
  return out;
}

export function total_codewords(version: number): number {
  return Math.floor(raw_data_modules(version) / 8);
}

export function data_codewords(version: number, ecc: Ecc): number {
  return total_codewords(version) - ecc_per_block(version, ecc) * block_count(version, ecc);
}
