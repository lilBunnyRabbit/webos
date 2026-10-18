import { z } from "zod";

export class InputError extends Error {}

export const InputKind = { TEXT: "text", GRAPH: "graph", POINTS: "points" } as const;
export type InputKind = (typeof InputKind)[keyof typeof InputKind];

export interface InputSpec<I> {
  kind: InputKind;
  hint: string;
  schema: z.ZodType<I>;
  parse(text: string): I;
  format(value: I): string;
  random(): I;
  sample: I;
}

export const random_int = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

export function shuffled<T>(values: readonly T[]): T[] {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const split = (text: string) =>
  text
    .split(/[\s,;]+/)
    .map((token) => token.trim())
    .filter(Boolean);

interface NumbersOptions {
  sample: number[];
  min_count?: number;
  max_count: number;
  min?: number;
  max?: number;
  random_count?: number;
  unique?: boolean;
  sorted?: boolean;
  hint?: string;
}

export function numbers(options: NumbersOptions): InputSpec<number[]> {
  const { min_count = 1, max_count, min = -999, max = 999, unique = false, sorted = false } = options;
  const check = (values: number[]) => {
    if (values.length < min_count) throw new InputError(`Give at least ${min_count} ${min_count === 1 ? "number" : "numbers"}.`);
    if (values.length > max_count) throw new InputError(`At most ${max_count} numbers here.`);
    if (values.some((value) => !Number.isInteger(value) || value < min || value > max))
      throw new InputError(`Whole numbers from ${min} to ${max}.`);
    if (unique && new Set(values).size !== values.length) throw new InputError("Every number once: no repeats.");
    return sorted ? [...values].sort((a, b) => a - b) : values;
  };
  return {
    kind: InputKind.TEXT,
    hint: options.hint ?? `Up to ${max_count} whole numbers, separated by commas or spaces`,
    schema: z.array(z.number().int()).transform((values, context) => {
      try {
        return check(values);
      } catch (error) {
        context.addIssue({ code: "custom", message: (error as Error).message });
        return z.NEVER;
      }
    }) as unknown as z.ZodType<number[]>,
    parse: (text) => {
      const values = split(text).map(Number);
      if (values.some(Number.isNaN)) throw new InputError("Only numbers, please.");
      return check(values);
    },
    format: (values) => values.join(", "),
    random: () => {
      const count = Math.min(max_count, options.random_count ?? Math.min(max_count, 12));
      const low = Math.max(min, sorted || unique ? 1 : min < 0 ? 1 : min);
      const high = Math.min(max, Math.max(low + count * 3, 99));
      const pool = new Set<number>();
      const values: number[] = [];
      while (values.length < count) {
        const value = random_int(low, high);
        if (unique && pool.has(value)) continue;
        pool.add(value);
        values.push(value);
      }
      return sorted ? values.sort((a, b) => a - b) : values;
    },
    sample: options.sample,
  };
}

interface WordsOptions {
  sample: string[];
  pool: string[];
  max_count: number;
  hint?: string;
}

export function words(options: WordsOptions): InputSpec<string[]> {
  const check = (values: string[]) => {
    if (values.length === 0) throw new InputError("Give at least one word.");
    if (values.length > options.max_count) throw new InputError(`At most ${options.max_count} words here.`);
    if (values.some((word) => word.length > 16)) throw new InputError("Words up to 16 letters.");
    return values.map((word) => word.toLowerCase());
  };
  return {
    kind: InputKind.TEXT,
    hint: options.hint ?? "Words, separated by commas or spaces",
    schema: z.array(z.string()).transform((values) => values.map((word) => word.toLowerCase())),
    parse: (text) => check(split(text)),
    format: (values) => values.join(", "),
    random: () => shuffled(options.pool).slice(0, Math.min(options.max_count, 8)),
    sample: options.sample,
  };
}

interface TextOptions {
  sample: string;
  max_length: number;
  min_length?: number;
  alphabet?: string;
  random_length?: number;
  hint?: string;
}

export function text(options: TextOptions): InputSpec<string> {
  const check = (value: string) => {
    if (value.length < (options.min_length ?? 1)) throw new InputError("Type something first.");
    if (value.length > options.max_length) throw new InputError(`At most ${options.max_length} characters here.`);
    return value;
  };
  return {
    kind: InputKind.TEXT,
    hint: options.hint ?? `Text, up to ${options.max_length} characters`,
    schema: z.string().max(options.max_length),
    parse: check,
    format: (value) => value,
    random: () => {
      const alphabet = options.alphabet ?? "abcab";
      const length = options.random_length ?? Math.min(options.max_length, 16);
      return Array.from({ length }, () => alphabet[random_int(0, alphabet.length - 1)]).join("");
    },
    sample: options.sample,
  };
}

export function fields<I extends Record<string, unknown>>(spec: {
  sample: I;
  hint: string;
  schema: z.ZodType<I>;
  parse: (entries: Map<string, string>) => I;
  format: (value: I) => string;
  random: () => I;
}): InputSpec<I> {
  return {
    kind: InputKind.TEXT,
    hint: spec.hint,
    schema: spec.schema,
    parse: (text) => {
      const entries = new Map<string, string>();
      for (const part of text.split(";")) {
        const at = part.indexOf(":");
        if (at === -1) {
          if (part.trim()) throw new InputError(`Write each part as name: value (${spec.hint}).`);
          continue;
        }
        entries.set(part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim());
      }
      return spec.parse(entries);
    },
    format: spec.format,
    random: spec.random,
    sample: spec.sample,
  };
}

export function number_list(value: string | undefined, name: string): number[] {
  if (value === undefined || value === "") throw new InputError(`Missing ${name}.`);
  const values = split(value).map(Number);
  if (values.some((item) => !Number.isFinite(item))) throw new InputError(`${name}: numbers only.`);
  return values;
}

export function whole(value: string | undefined, name: string, min: number, max: number): number {
  const number = Number(value);
  if (value === undefined || !Number.isInteger(number) || number < min || number > max)
    throw new InputError(`${name}: a whole number from ${min} to ${max}.`);
  return number;
}
