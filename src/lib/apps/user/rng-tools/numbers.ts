import { z } from "zod";
import { crypto_source, random_int, type Checked, type RandomSource } from "./random";

export const MAX_NUMBER_COUNT = 1000;
// Above this span, unique draws skip repeats instead of materialising the range; fast because count is capped far below it.
const DENSE_SPAN = 100_000;

export interface NumberRequest {
  min: number;
  max: number;
  count: number;
  unique: boolean;
}

// An empty number field binds as null; storing NaN instead makes Svelte rewrite the input and eat a typed "-".
export interface NumberSettings {
  min: number | null;
  max: number | null;
  count: number | null;
  unique: boolean;
}

export const DEFAULT_NUMBER_SETTINGS: NumberSettings = { min: 1, max: 100, count: 1, unique: false };

export const number_settings_schema = z.object({
  min: z.number().int().nullable(),
  max: z.number().int().nullable(),
  count: z.number().int().nullable(),
  unique: z.boolean(),
});

export function check_numbers({ min, max, count, unique }: NumberSettings): Checked<NumberRequest> {
  if (min === null || max === null) return { ok: false, error: "Fill in both bounds." };
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) return { ok: false, error: "Bounds must be whole numbers." };
  if (max < min) return { ok: false, error: "Maximum must be at least the minimum." };
  if (max - min + 1 > 2 ** 53) return { ok: false, error: "The range is too wide." };
  if (count === null || !Number.isInteger(count) || count < 1 || count > MAX_NUMBER_COUNT) {
    return { ok: false, error: `How many must be between 1 and ${MAX_NUMBER_COUNT}.` };
  }
  if (unique && count > max - min + 1) {
    return { ok: false, error: `Only ${max - min + 1} different numbers fit in this range.` };
  }
  return { ok: true, value: { min, max, count, unique } };
}

export function generate_numbers({ min, max, count, unique }: NumberRequest, source: RandomSource = crypto_source): number[] {
  if (!unique) return Array.from({ length: count }, () => random_int(min, max, source));

  const span = max - min + 1;
  if (count > span) throw new RangeError("More unique numbers than the range holds");
  if (span <= DENSE_SPAN) {
    const pool = Array.from({ length: span }, (_, i) => min + i);
    for (let i = 0; i < count; i++) {
      const j = random_int(i, span - 1, source);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, count);
  }

  const seen = new Set<number>();
  while (seen.size < count) seen.add(random_int(min, max, source));
  return [...seen];
}
