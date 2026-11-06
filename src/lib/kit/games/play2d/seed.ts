/** Mixes a seed with any integers into a new 32-bit seed, so each part of a seeded world gets its own stream. */
export function hash(seed: number, ...values: number[]): number {
  let h = seed >>> 0;
  for (const value of values) {
    h = Math.imul(h ^ (value | 0), 0x9e3779b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca77);
    h ^= h >>> 13;
  }
  return h >>> 0;
}
