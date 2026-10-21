// Both sides derive a repair symbol's neighbours from `(k, esi)` alone, so a frame only carries the number (ADR-060).
const SOLITON_C = 0.05;
const SOLITON_DELTA = 0.5;
/**
 * Repair symbols only matter for the blocks a receiver missed in the plain pass. Plain robust soliton over all `k`
 * leaves about half of them covering only blocks it already has (2.3-2.8× `k` frames at 20% missed, simulated), so
 * the degree is drawn for the expected missing set and scaled up to cover it: 1.43× at 20%, 1.65× at 30%.
 */
const DESIGN_LOSS = 0.3;

export function repair_degrees(k: number): Float64Array {
  return robust_soliton(Math.max(1, Math.ceil(k * DESIGN_LOSS)));
}

export function prng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function robust_soliton(k: number): Float64Array {
  const cdf = new Float64Array(k);
  if (k === 1) {
    cdf[0] = 1;
    return cdf;
  }
  const spread = SOLITON_C * Math.log(k / SOLITON_DELTA) * Math.sqrt(k);
  const pivot = Math.min(k, Math.max(1, Math.floor(k / spread)));
  const weights = new Float64Array(k);
  for (let degree = 1; degree <= k; degree++) {
    const ideal = degree === 1 ? 1 / k : 1 / (degree * (degree - 1));
    const robust =
      degree < pivot ? spread / (degree * k) : degree === pivot ? (spread * Math.log(spread / SOLITON_DELTA)) / k : 0;
    weights[degree - 1] = ideal + Math.max(0, robust);
  }
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let running = 0;
  for (let index = 0; index < k; index++) {
    running += weights[index] / total;
    cdf[index] = running;
  }
  cdf[k - 1] = 1;
  return cdf;
}

export function neighbours(k: number, esi: number, cdf: Float64Array): number[] {
  if (esi < k) return [esi];
  const random = prng(Math.imul(esi, 0x9e3779b1) ^ k);
  const roll = random();
  let degree = 1;
  while (degree < cdf.length && cdf[degree - 1] < roll) degree++;
  degree = Math.min(k, Math.round(degree / DESIGN_LOSS));

  if (degree * 4 > k) {
    const pool = Array.from({ length: k }, (_, index) => index);
    for (let index = 0; index < degree; index++) {
      const pick = index + Math.floor(random() * (k - index));
      [pool[index], pool[pick]] = [pool[pick], pool[index]];
    }
    return pool.slice(0, degree).sort((a, b) => a - b);
  }
  const picked = new Set<number>();
  while (picked.size < degree) picked.add(Math.floor(random() * k));
  return [...picked].sort((a, b) => a - b);
}

export function xor_into(target: Uint8Array, source: Uint8Array): void {
  for (let index = 0; index < target.length; index++) target[index] ^= source[index];
}

export function encode_symbol(blocks: Uint8Array[], esi: number, cdf: Float64Array): Uint8Array {
  const [first, ...rest] = neighbours(blocks.length, esi, cdf);
  const symbol = blocks[first].slice();
  for (const index of rest) xor_into(symbol, blocks[index]);
  return symbol;
}

interface Equation {
  unknown: Set<number>;
  data: Uint8Array;
}

export class Peeler {
  readonly blocks: (Uint8Array | null)[];
  private solved = 0;
  private readonly waiting: Equation[][];
  private readonly cdf: Float64Array;

  constructor(readonly k: number) {
    this.blocks = Array.from({ length: k }, () => null);
    this.waiting = Array.from({ length: k }, () => []);
    this.cdf = repair_degrees(k);
  }

  get known(): number {
    return this.solved;
  }

  get complete(): boolean {
    return this.solved === this.k;
  }

  add(esi: number, payload: Uint8Array): void {
    if (this.complete) return;
    const data = payload.slice();
    const unknown = new Set<number>();
    for (const index of neighbours(this.k, esi, this.cdf)) {
      const block = this.blocks[index];
      if (block) xor_into(data, block);
      else unknown.add(index);
    }
    if (unknown.size === 0) return;
    if (unknown.size === 1) return this.solve(unknown.values().next().value!, data);
    const equation: Equation = { unknown, data };
    for (const index of unknown) this.waiting[index].push(equation);
  }

  private solve(start: number, value: Uint8Array): void {
    const queue: [number, Uint8Array][] = [[start, value]];
    while (queue.length > 0) {
      const [index, data] = queue.pop()!;
      if (this.blocks[index]) continue;
      this.blocks[index] = data;
      this.solved++;
      const waiting = this.waiting[index];
      this.waiting[index] = [];
      for (const equation of waiting) {
        if (!equation.unknown.delete(index)) continue;
        xor_into(equation.data, data);
        if (equation.unknown.size !== 1) continue;
        const last = equation.unknown.values().next().value!;
        equation.unknown.clear();
        queue.push([last, equation.data]);
      }
    }
  }
}
