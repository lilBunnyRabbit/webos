export type RandomSource = () => number;

export type Checked<T> = { ok: true; value: T } | { ok: false; error: string };

const UINT32_RANGE = 2 ** 32;
const SAFE_RANGE = 2 ** 53;

export const crypto_source: RandomSource = () => crypto.getRandomValues(new Uint32Array(1))[0];

// Rejection sampling: a plain `draw % span` favours the low end whenever span doesn't divide 2^32.
export function random_int(min: number, max: number, source: RandomSource = crypto_source): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) throw new RangeError("Bounds must be safe integers");
  if (max < min) throw new RangeError("max must not be below min");

  const span = max - min + 1;
  if (span > SAFE_RANGE) throw new RangeError("Range is wider than 2^53");
  if (span === 1) return min;

  if (span <= UINT32_RANGE) {
    const limit = UINT32_RANGE - (UINT32_RANGE % span);
    for (;;) {
      const draw = source();
      if (draw < limit) return min + (draw % span);
    }
  }

  const limit = SAFE_RANGE - (SAFE_RANGE % span);
  for (;;) {
    const draw = (source() >>> 11) * UINT32_RANGE + source();
    if (draw < limit) return min + (draw % span);
  }
}

export function random_bool(source: RandomSource = crypto_source): boolean {
  return random_int(0, 1, source) === 1;
}

export function shuffle<T>(items: readonly T[], source: RandomSource = crypto_source): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = random_int(0, i, source);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function sample<T>(items: readonly T[], count: number, source: RandomSource = crypto_source): T[] {
  const result = [...items];
  const take = Math.min(Math.max(0, Math.floor(count)), result.length);
  for (let i = 0; i < take; i++) {
    const j = random_int(i, result.length - 1, source);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.slice(0, take);
}
