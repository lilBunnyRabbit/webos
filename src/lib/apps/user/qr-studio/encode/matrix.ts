import { alignment_positions, ECC_FORMAT_BITS, symbol_size, type Ecc } from "./tables";

export const Region = {
  DATA: 0,
  FINDER: 1,
  SEPARATOR: 2,
  TIMING: 3,
  ALIGNMENT: 4,
  FORMAT: 5,
  VERSION: 6,
  DARK: 7,
} as const;
export type Region = (typeof Region)[keyof typeof Region];

export interface Grid {
  size: number;
  modules: Uint8Array;
  regions: Uint8Array;
}

export function empty_grid(version: number): Grid {
  const size = symbol_size(version);
  return { size, modules: new Uint8Array(size * size), regions: new Uint8Array(size * size) };
}

function set(grid: Grid, x: number, y: number, dark: boolean, region: Region): void {
  const index = y * grid.size + x;
  grid.modules[index] = dark ? 1 : 0;
  grid.regions[index] = region;
}

export function function_grid(version: number): Grid {
  const grid = empty_grid(version);
  const { size } = grid;

  for (let i = 0; i < size; i++) {
    set(grid, 6, i, i % 2 === 0, Region.TIMING);
    set(grid, i, 6, i % 2 === 0, Region.TIMING);
  }

  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= size || y < 0 || y >= size) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        set(grid, x, y, ring !== 2 && ring !== 4, ring === 4 ? Region.SEPARATOR : Region.FINDER);
      }
    }
  }

  const centres = alignment_positions(version);
  const last = centres.length - 1;
  centres.forEach((cy, i) =>
    centres.forEach((cx, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) set(grid, cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1, Region.ALIGNMENT);
    })
  );

  draw_format(grid, 0);
  draw_version(grid, version);
  return grid;
}

// XORed with 0x5412 so the format bits are never all light.
export function format_bits(ecc: Ecc, mask: number): number {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask;
  let rest = data;
  for (let i = 0; i < 10; i++) rest = (rest << 1) ^ ((rest >>> 9) * 0x537);
  return ((data << 10) | rest) ^ 0x5412;
}

export function version_bits(version: number): number {
  let rest = version;
  for (let i = 0; i < 12; i++) rest = (rest << 1) ^ ((rest >>> 11) * 0x1f25);
  return (version << 12) | rest;
}

const bit = (value: number, i: number) => ((value >>> i) & 1) === 1;

export function draw_format(grid: Grid, bits: number): void {
  const { size } = grid;
  for (let i = 0; i <= 5; i++) set(grid, 8, i, bit(bits, i), Region.FORMAT);
  set(grid, 8, 7, bit(bits, 6), Region.FORMAT);
  set(grid, 8, 8, bit(bits, 7), Region.FORMAT);
  set(grid, 7, 8, bit(bits, 8), Region.FORMAT);
  for (let i = 9; i < 15; i++) set(grid, 14 - i, 8, bit(bits, i), Region.FORMAT);
  for (let i = 0; i < 8; i++) set(grid, size - 1 - i, 8, bit(bits, i), Region.FORMAT);
  for (let i = 8; i < 15; i++) set(grid, 8, size - 15 + i, bit(bits, i), Region.FORMAT);
  set(grid, 8, size - 8, true, Region.DARK);
}

function draw_version(grid: Grid, version: number): void {
  if (version < 7) return;
  const bits = version_bits(version);
  for (let i = 0; i < 18; i++) {
    const a = grid.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    set(grid, a, b, bit(bits, i), Region.VERSION);
    set(grid, b, a, bit(bits, i), Region.VERSION);
  }
}

export function placement_order(grid: Grid): Uint32Array {
  const { size, regions } = grid;
  const out: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const y = upward ? size - 1 - step : step;
      for (let j = 0; j < 2; j++) {
        const index = y * size + right - j;
        if (regions[index] === Region.DATA) out.push(index);
      }
    }
  }
  return Uint32Array.from(out);
}

export function place(grid: Grid, order: Uint32Array, codewords: readonly number[]): void {
  order.forEach((index, i) => {
    const byte = codewords[i >>> 3];
    grid.modules[index] = byte !== undefined && (byte >>> (7 - (i & 7))) & 1 ? 1 : 0;
  });
}

export const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

export const MASK_FORMULAS = [
  "(x + y) mod 2 = 0",
  "y mod 2 = 0",
  "x mod 3 = 0",
  "(x + y) mod 3 = 0",
  "(⌊x/3⌋ + ⌊y/2⌋) mod 2 = 0",
  "xy mod 2 + xy mod 3 = 0",
  "(xy mod 2 + xy mod 3) mod 2 = 0",
  "((x + y) mod 2 + xy mod 3) mod 2 = 0",
];

export function apply_mask(grid: Grid, mask: number): void {
  const { size, modules, regions } = grid;
  const formula = MASKS[mask];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      if (regions[index] === Region.DATA && formula(x, y)) modules[index] ^= 1;
    }
}

export interface Penalty {
  runs: number;
  blocks: number;
  finders: number;
  balance: number;
  total: number;
}

// Run history is the last seven run lengths, newest first; the edges count as light so a pattern touching the border still scores.
function count_finders(history: number[]): number {
  const n = history[1];
  const core = n > 0 && history[2] === n && history[3] === n * 3 && history[4] === n && history[5] === n;
  return (core && history[0] >= n * 4 && history[6] >= n ? 1 : 0) + (core && history[6] >= n * 4 && history[0] >= n ? 1 : 0);
}

function push_run(history: number[], length: number, size: number): void {
  if (history[0] === 0) length += size;
  history.pop();
  history.unshift(length);
}

function line_penalty(size: number, at: (i: number) => number): { runs: number; finders: number } {
  let runs = 0;
  let finders = 0;
  let colour = 0;
  let length = 0;
  const history = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 0; i < size; i++) {
    if (at(i) === colour) {
      length++;
      if (length === 5) runs += 3;
      else if (length > 5) runs++;
    } else {
      push_run(history, length, size);
      if (!colour) finders += count_finders(history);
      colour = at(i);
      length = 1;
    }
  }
  if (colour) {
    push_run(history, length, size);
    length = 0;
  }
  push_run(history, length + size, size);
  finders += count_finders(history);
  return { runs, finders };
}

export function penalty({ size, modules }: Grid): Penalty {
  let runs = 0;
  let finders = 0;
  for (let y = 0; y < size; y++) {
    const line = line_penalty(size, (x) => modules[y * size + x]);
    runs += line.runs;
    finders += line.finders;
  }
  for (let x = 0; x < size; x++) {
    const line = line_penalty(size, (y) => modules[y * size + x]);
    runs += line.runs;
    finders += line.finders;
  }

  let blocks = 0;
  for (let y = 0; y < size - 1; y++)
    for (let x = 0; x < size - 1; x++) {
      const colour = modules[y * size + x];
      if (colour === modules[y * size + x + 1] && colour === modules[(y + 1) * size + x] && colour === modules[(y + 1) * size + x + 1]) blocks += 3;
    }

  let dark = 0;
  for (const module of modules) dark += module;
  const total = size * size;
  const balance = (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;

  return { runs, blocks, finders: finders * 40, balance, total: runs + blocks + finders * 40 + balance };
}
